'use strict';

const T = require('sanctuary-def');

const AutoPredicate = f =>
  T.NullaryType(`[${f.toString()}]`, f);

const B = (f, g) => (...args) => f(g(...args));

const map = require('ramda/src/map');
const curryN = require('ramda/src/curryN');

const values = o =>
  Array.isArray(o)
    ? o
    : Object.keys(o).map(k => o[k]);

const zipObj = ks => vs =>
  ks.length
    ? Object.assign(
      ...ks.map((k, i) => ({[k]: vs[i]}))
    )
    : {};

const unapply = f => (...values) => f(values);

const mapConstrToFn = constraint =>

  constraint === String
    ? T.String
  : constraint === Number
    ? T.Number
  : constraint === Boolean
    ? T.Boolean
  : constraint === Object
    ? T.Object
  : constraint === Array
    ? T.Array(T.Any)
  : constraint === Function
    ? T.AnyFunction
    : constraint;

const BuiltInType = function(t) {
  const mapped = mapConstrToFn(t);
  return mapped === t ?
           t.constructor === Function ? AutoPredicate(t) : t :
           mapped;
};

const a = T.TypeVariable('a');

const createIterator = function() {
  return {
    idx: 0,
    val: this,
    next() {

      const keys = this.val._keys;

      return this.idx === keys.length ?
        {done: true} :
        // eslint-disable-next-line no-plusplus
        {value: this.val[keys[this.idx++]]};
    },
  };
};

const staticCase = function(options, b, ...args) {
  const f = options[b._name];
  if (f) {

    const values = b._keys.map(k => b[k]);
    return f(...[...values, ...args]);

  } else if (options._) {
    return options._(b);
  } else {
    // caseOn is untyped
    // so this is possible
    throw new TypeError(
      'Non exhaustive case statement'
    );
  }
};

const CaseRecordType = function(keys, enums) {
  return T.RecordType(
    keys.length
    ? Object.assign(
      ...keys.map(
        k => ({
          [k]: T.Function(values(enums[k]).concat(a)),
        })
      )
    )
    : {}
  );
};

const ObjConstructorOf = prototype => (keys, name) => r =>
  Object.assign(
    Object.create(prototype),
    r,
    {
      _keys: keys,
      _name: name,
      [Symbol.iterator]: createIterator,
    }
  );

const RecursiveType = Type => v => typeof v === 'undefined' ? Type : v;

const processRawCases =
  (Type, rawCases) =>
    map(
      map(
        B(
          BuiltInType,
          RecursiveType(Type)
        )
      ),
      rawCases
    );

const CreateCaseConstructor = function(def, prototype, typeName, cases) {

  const objConstructorOf =
    ObjConstructorOf(prototype);

  return function createCaseConstructor(k) {

    const type = cases[k];

    const isArray =
      Array.isArray(type);

    const keys = Object.keys(type);

    const types =
      isArray
        ? type
        : values(type);

    const recordType =
      isArray
        ? T.RecordType(
          zipObj(keys)(types)
        )
        : T.RecordType(type);

    return {
      [`${k}Of`]:
        def(`${typeName}.${k}Of`,
            {},
            [recordType, recordType],
            objConstructorOf(keys, k)),
      [k]:
        def(`${typeName}.${k}`,
            {},
            types.concat(recordType),
            B(objConstructorOf(keys, k),
              unapply(zipObj(keys)))),
    };
  };
};


const boundStaticCase = function(options) {
  return staticCase(options, this);
};

const Setup = function({check, ENV = T.env}) {

  const def =
    T.create({
      checkTypes: check,
      env: ENV,
    });

  const CreateUnionType = function(typeName, rawCases, prototype = {}) {

    const Type = T.NullaryType(
      typeName,
      a => a && a['@@type'] === typeName
    );

    const keys =
      Object.keys(rawCases);

    const env =
      ENV.concat(Type);

    const def = T.create({checkTypes: check, env});

    const cases =
      processRawCases(Type, rawCases);

    const createCaseConstructor =
      CreateCaseConstructor(
        def,
        prototype,
        typeName,
        cases
      );

    const constructors =
      keys.map(createCaseConstructor);

    const caseRecordType =
      CaseRecordType(keys, cases);

    const instanceCaseDef =
      def(`${typeName}::case`,
          {},
          [caseRecordType, a],
          boundStaticCase);

    const flexibleInstanceCase = function(o, ...args) {
      return o._ ?
        boundStaticCase.apply(this, [o, ...args]) :
        instanceCaseDef.apply(this, [o, ...args]);
    };
    Type.prototype = Object.assign(
      prototype,
      {
        '@@type': typeName,
        case: flexibleInstanceCase,
        env,
      }
    );

    Type.prototype.case.toString =
      Type.prototype.case.inspect =
      instanceCaseDef.toString;

    const staticCaseDef =
      def(`${typeName}.case`,
          {},
          [caseRecordType, Type, a],
          staticCase);

    const flexibleStaticCase = function(o, ...args) {
      return o._ ?
        curryN(2, staticCase).apply(this, [o, ...args]) :
        staticCaseDef.apply(this, [o, ...args]);
    };

    Type.case = flexibleStaticCase;

    Type.case.toString =
      Type.case.inspect =
        staticCaseDef.toString;

    // caseOn opts out of typing because I'm
    // not smart enough to do it efficiently
    Type.caseOn = curryN(3, staticCase);

    return Object.assign(
      Type
      , ...constructors
    );
  };

  const Named =
    def('UnionType.Named',
        {},
        [T.String, T.StrMap(T.Any), T.Any],
        CreateUnionType);

  const Anonymous =
    def('UnionType.Anonymous',
        {},
        [T.StrMap(T.Any), T.Any],
        enums =>
          CreateUnionType(`(${Object.keys(enums).join(' | ')})`,
                          enums));

  const Class =
    def('UnionType.Class',
        {},
        [T.String, T.StrMap(T.Any), T.Object, T.Any],
        CreateUnionType);

  return {
    Anonymous,
    Named,
    Class,
  };
};

module.exports = Setup;
