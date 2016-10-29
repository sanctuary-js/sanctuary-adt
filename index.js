'use strict';

const curryN = require('ramda/src/curryN');
const map = require('ramda/src/map');
const $ = require('sanctuary-def');


const B = (f, g) => (...args) => f(g(...args));

const values = o =>
  Array.isArray(o) ? o : Object.keys(o).map(k => o[k]);

const zipObj = ks => vs =>
  ks.length ? Object.assign(...ks.map((k, i) => ({[k]: vs[i]}))) : {};

const unapply = f => (...values) => f(values);

const BuiltInType = function(t) {
  switch (t.name) {
    case 'Boolean':
    case 'Number':
    case 'Object':
    case 'String':
      return $[t.name];
    case 'Array':
      return $.Array($.Any);
    case 'Function':
      return $.AnyFunction;
    default:
      return typeof t === 'function' ? $.NullaryType(`[${t}]`, t) : t;
  }
};

const a = $.TypeVariable('a');

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
    throw new TypeError('Non exhaustive case statement');
  }
};

const CaseRecordType = function(keys, enums) {
  return $.RecordType(
    keys.length ?
      Object.assign(
        ...keys.map(k => ({[k]: $.Function(values(enums[k]).concat(a))}))
      ) :
      {}
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

const processRawCases = (Type, rawCases) =>
  map(map(B(BuiltInType, RecursiveType(Type))), rawCases);

const CreateCaseConstructor = function(def, prototype, typeName, cases) {
  return function createCaseConstructor(k) {
    const type = cases[k];
    const isArray = Array.isArray(type);
    const keys = Object.keys(type);
    const types = isArray ? type : values(type);
    const recordType = $.RecordType(isArray ? zipObj(keys)(types) : type);

    return {
      [`${k}Of`]:
        def(`${typeName}.${k}Of`,
            {},
            [recordType, recordType],
            ObjConstructorOf(prototype)(keys, k)),
      [k]:
        def(`${typeName}.${k}`,
            {},
            types.concat(recordType),
            B(ObjConstructorOf(prototype)(keys, k),
              unapply(zipObj(keys)))),
    };
  };
};


const boundStaticCase = function(options) {
  return staticCase(options, this);
};

module.exports = opts => {

  const def = $.create(opts);

  const CreateUnionType = function(typeName, rawCases, prototype = {}) {
    //    Type :: Type
    const Type = $.NullaryType(
      typeName,
      x => x != null && x['@@type'] === typeName
    );
    const keys = Object.keys(rawCases);
    const env = opts.env.concat([Type]);
    const def = $.create({checkTypes: opts.checkTypes, env});
    const cases = processRawCases(Type, rawCases);
    const createCaseConstructor =
      CreateCaseConstructor(def, prototype, typeName, cases);
    const constructors = keys.map(createCaseConstructor);
    const caseRecordType = CaseRecordType(keys, cases);

    const instanceCaseDef =
      def(`${typeName}::case`,
          {},
          [caseRecordType, a],
          boundStaticCase);

    Type.prototype = Object.assign(prototype, {
      '@@type': typeName,
      case: function(o, ...args) {
        return o._ ?
          boundStaticCase.apply(this, [o, ...args]) :
          instanceCaseDef.apply(this, [o, ...args]);
      },
      env,
    });

    Type.prototype.case.toString =
    Type.prototype.case.inspect = instanceCaseDef.toString;

    const staticCaseDef =
      def(`${typeName}.case`,
          {},
          [caseRecordType, Type, a],
          staticCase);

    Type.case = function(o, ...args) {
      return o._ ?
        curryN(2, staticCase).apply(this, [o, ...args]) :
        staticCaseDef.apply(this, [o, ...args]);
    };

    Type.case.toString =
    Type.case.inspect = staticCaseDef.toString;

    // caseOn opts out of typing because I'm
    // not smart enough to do it efficiently
    Type.caseOn = curryN(3, staticCase);

    return Object.assign(Type, ...constructors);
  };

  const Named =
    def('UnionType.Named',
        {},
        [$.String, $.StrMap($.Any), $.Any],
        CreateUnionType);

  const Anonymous =
    def('UnionType.Anonymous',
        {},
        [$.StrMap($.Any), $.Any],
        enums =>
          CreateUnionType(`(${Object.keys(enums).join(' | ')})`, enums));

  const Class =
    def('UnionType.Class',
        {},
        [$.String, $.StrMap($.Any), $.Object, $.Any],
        CreateUnionType);

  return {Anonymous, Named, Class};
};
