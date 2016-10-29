'use strict';

const curryN = require('ramda/src/curryN');
const map = require('ramda/src/map');
const $ = require('sanctuary-def');


//    values :: Any -> Array a
const values = o =>
  Array.isArray(o) ? o : Object.keys(o).map(k => o[k]);

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
    return options[b._name](...[...b._keys.map(k => b[k]), ...args]);
  } else if ('_' in options) {
    return options._(b);
  }

  // caseOn is untyped
  // so this is possible
  throw new TypeError('Non exhaustive case statement');
};

const CaseRecordType = (keys, enums) =>
  $.RecordType(Object.assign(
    {},
    ...keys.map(k => ({[k]: $.Function(values(enums[k]).concat(a))}))
  ));

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
          types.concat(recordType),
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
    const env = opts.env.concat([Type]);
    const def = $.create({checkTypes: opts.checkTypes, env});
    const cases =
      map(map(x => BuiltInType(x === undefined ? Type : x)), _cases);
    const constructors =
      keys.map(k => CreateCaseConstructor(def, prototype, typeName, cases, k));
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
      return '_' in o ?
        def('anonymous', {}, [$.Any, $.Any, $.Any], staticCase)
          .apply(null, [o, ...args]) :
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
