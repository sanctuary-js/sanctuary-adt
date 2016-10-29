'use strict';

const curryN = require('ramda/src/curryN');
const $ = require('sanctuary-def');
const Z = require('sanctuary-type-classes');


//    values :: Any -> Array a
const values = o =>
  Array.isArray(o) ? o : Z.map(k => o[k], Object.keys(o));

//    zipObj :: (Array String, Array a) -> StrMap a
const zipObj = (ks, vs) =>
  ks.reduce((acc, k, idx) => { acc[k] = vs[idx]; return acc; }, {});

const BuiltInType = t => {
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

const staticCase = (options, b, ...args) => {
  if (b._name in options) {
    return options[b._name](...Z.concat(Z.map(k => b[k], b._keys), args));
  } else if ('_' in options) {
    return options._(b);
  }

  // caseOn is untyped
  // so this is possible
  throw new TypeError('Non exhaustive case statement');
};

const CaseRecordType = (keys, enums) => {
  const f = k => ({[k]: $.Function(Z.concat(values(enums[k]), [a]))});
  return $.RecordType(Z.reduce(Z.concat, {}, Z.map(f, keys)));
};

const ObjConstructorOf = (prototype, keys, name, r) =>
  Object.assign(Object.create(prototype), r, {
    _keys: keys,
    _name: name,
    [Symbol.iterator]: createIterator,
  });

const CreateCaseConstructor = (def, prototype, typeName, cases, k) => {
  const type = cases[k];
  const isArray = Array.isArray(type);
  const keys = Object.keys(type);
  const types = isArray ? type : values(type);
  const recordType = $.RecordType(isArray ? zipObj(keys, types) : type);

  return {
    [`${k}Of`]:
      def(`${typeName}.${k}Of`,
          {},
          [recordType, recordType],
          t => ObjConstructorOf(prototype, keys, k, t)),
    [k]:
      def(`${typeName}.${k}`,
          {},
          Z.concat(types, [recordType]),
          (...args) =>
            ObjConstructorOf(prototype, keys, k, zipObj(keys, args))),
  };
};


module.exports = opts => {

  const def = $.create(opts);

  const CreateUnionType = (typeName, _cases, prototype) => {
    //    Type :: Type
    const Type = $.NullaryType(
      typeName,
      x => x != null && x['@@type'] === typeName
    );
    const keys = Object.keys(_cases);
    const env = Z.concat(opts.env, [Type]);
    const def = $.create({checkTypes: opts.checkTypes, env});
    const cases =
      Z.map(xs => Z.map(x => BuiltInType(x === undefined ? Type : x), xs),
            _cases);
    const constructors =
      Z.map(k => CreateCaseConstructor(def, prototype, typeName, cases, k),
            keys);
    const caseRecordType = CaseRecordType(keys, cases);

    const instanceCaseDef =
      def(`${typeName}::case`,
          {},
          [caseRecordType, a],
          function(t) { return staticCase(t, this); });

    Type.prototype = Object.assign(prototype, {
      '@@type': typeName,
      case: function(o, ...args) {
        return '_' in o ?
          staticCase.apply(null, [o, this]) :
          instanceCaseDef.apply(this, Z.concat([o], args));
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

    Type.case = function(o, ..._args) {
      const args = Z.concat([o], _args);
      return '_' in o ?
        def('anonymous', {}, [$.Any, $.Any, $.Any], staticCase)(...args) :
        staticCaseDef.apply(this, args);
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
        (typeName, _cases) => CreateUnionType(typeName, _cases, {}));

  const Anonymous =
    def('UnionType.Anonymous',
        {},
        [$.StrMap($.Any), $.Any],
        enums =>
          CreateUnionType(`(${Object.keys(enums).join(' | ')})`, enums, {}));

  const Class =
    def('UnionType.Class',
        {},
        [$.String, $.StrMap($.Any), $.Object, $.Any],
        CreateUnionType);

  return {Anonymous, Named, Class};
};
