'use strict';

const $ = require('sanctuary-def');
const Z = require('sanctuary-type-classes');


//    stripNamespace :: String -> String
const stripNamespace = s => s.slice(s.indexOf('/') + 1);

//    values :: Any -> Array a
const values = o =>
  Array.isArray(o) ? o : Z.map(k => o[k], Object.keys(o));

//    zipObj :: (Array String, Array a) -> StrMap a
const zipObj = (ks, vs) =>
  ks.reduce((acc, k, idx) => { acc[k] = vs[idx]; return acc; }, {});

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


module.exports = opts => {

  const def = $.create(opts);

  const CreateUnionType = (typeName, _cases, _prototype) => {
    const unprefixedTypeName = stripNamespace(typeName);
    //    Type :: Type
    const Type = $.NullaryType(
      typeName,
      x => x != null && x['@@type'] === typeName
    );
    const env = Z.concat(opts.env, [Type]);
    const def = $.create({checkTypes: opts.checkTypes, env});
    const cases =
      Z.map(xs => Z.map(x => x === undefined ? Type : x, xs),
            _cases);
    const CaseRecordType =
      $.RecordType(Z.map(x => $.Function(Z.concat(values(x), [a])), cases));

    const prototype$case = function(cases) {
      return '_' in cases ?
        cases._(this) :
        def(
          `${unprefixedTypeName}::case`,
          {},
          [CaseRecordType, a],
          cases => cases[this._name](...Z.map(k => this[k], this._keys))
        )(cases);
    };

    Type.case = function(o, ..._args) {
      return def(
        `${unprefixedTypeName}.case`,
        {},
        ['_' in o ? $.Any : CaseRecordType, Type, a],
        (cases, value) =>
          value._name in cases ?
            cases[value._name](...Z.map(k => value[k], value._keys)) :
            cases._(value)
      ).apply(this, Z.concat([o], _args));
    };

    Object.keys(cases).forEach(name => {
      const type = cases[name];
      const isArray = Array.isArray(type);
      const keys = Object.keys(type);
      const types = isArray ? type : values(type);
      const recordType = $.RecordType(isArray ? zipObj(keys, types) : type);

      const of =
      def(`${unprefixedTypeName}.${name}Of`,
          {},
          [recordType, recordType],
          r => {
            const prototype = Object.create(_prototype);
            prototype._keys = keys;
            prototype._name = name;
            prototype.case = prototype$case;
            prototype['@@type'] = typeName;
            prototype[Symbol.iterator] = createIterator;
            Object.keys(r).forEach(k => { prototype[k] = r[k]; });
            return prototype;
          });

      const ctor =
      def(`${unprefixedTypeName}.${name}`,
          {},
          Z.concat(types, [recordType]),
          (...args) => of(zipObj(keys, args)));

      Type[`${name}Of`] = of;
      Type[name] = ctor;
    });

    return Type;
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
