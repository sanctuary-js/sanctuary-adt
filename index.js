(function(f) {

  'use strict';

  /* istanbul ignore else */
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = f(require('sanctuary-def'),
                       require('sanctuary-type-classes'));
  } else if (typeof define === 'function' && define.amd != null) {
    define(['sanctuary-def', 'sanctuary-type-classes'], f);
  } else {
    self.sanctuaryUnionType = f(self.sanctuaryDef, self.sanctuaryTypeClasses);
  }

}(function($, Z) {

  'use strict';

  //  identity :: a -> a
  var identity = function(x) { return x; };

  //  values :: StrMap a -> Array a
  var values = function(o) {
    return Z.map(function(k) { return o[k]; }, Object.keys(o));
  };

  //  getTypeVarNames :: Type -> Array String
  var getTypeVarNames = function recur(t) {
    return t.type === 'VARIABLE' ?
      [t.name] :
      Z.reduce(function(typeVarNames, r) {
        return Z.concat(typeVarNames, recur(r.type));
      }, [], t.types);
  };

  //  createUnusedTypeVar :: Array String -> Type
  var createUnusedTypeVar = function(typeVarNames) {
    for (var typeVarName = 'a';
         typeVarNames.indexOf(typeVarName) >= 0;
         typeVarName = String.fromCharCode(typeVarName.charCodeAt(0) + 1)) {}
    return $.TypeVariable(typeVarName);
  };

  //  type0 :: String -> Type
  var type0 = function(name) {
    return $.NullaryType(
      name,
      function(x) { return x != null && x['@@type'] === name; }
    );
  };

  //  recTypeRef :: String
  var recTypeRef = '@@functional/recursive-type-reference';

  //  Self :: PossiblyRecursiveType
  var Self = {}; Self[recTypeRef] = true;

  //  PossiblyRecursiveType :: Type
  var PossiblyRecursiveType = $.NullaryType(
    'sanctuary-union-type/Type',
    function(x) {
      return x != null &&
             (x[recTypeRef] === true || x['@@type'] === 'sanctuary-def/Type');
    }
  );

  //  create ::
  //    { checkTypes :: Boolean, env :: Array Type } ->
  //      String -> StrMap (Array Type) -> Type
  var create = function(opts) {
    var UnionType = $.create({checkTypes: true, env: $.env})(
      'UnionType',
      {},
      [$.String,
       $.StrMap($.Array(PossiblyRecursiveType)),
       type0('sanctuary-def/Type')],
      function(typeName, _cases) {
        var unprefixedTypeName = typeName.slice(typeName.indexOf('/') + 1);
        var Type = type0(typeName);
        var env = Z.concat(opts.env, [Type]);
        var def = $.create({checkTypes: opts.checkTypes, env: env});

        var cases = Z.map(function(xs) {
          return Z.map(function(x) {
            return x[recTypeRef] === true ? Type : x;
          }, xs);
        }, _cases);

        Type.prototype = {'@@type': typeName};

        Object.keys(cases).forEach(function(tag) {
          var types = values(cases[tag]);

          var construct =
          def(unprefixedTypeName + '.' + tag,
              {},
              Z.concat(types, [Type]),
              function() {
                var o = Object.create(Type.prototype);
                o.tag = tag;
                o.values = Array.prototype.slice.call(arguments);
                return o;
              });

          Type[tag] = types.length === 0 ? construct() : construct;
        });

        var TypeVar =
        createUnusedTypeVar(Z.chain(getTypeVarNames,
                                    Z.chain(identity, values(cases))));

        var RecordType = $.RecordType(Z.map(function(types) {
          return $.Function(Z.concat(types, [TypeVar]));
        }, cases));

        Type.fold =
        def(unprefixedTypeName + '.fold',
            {},
            [RecordType, Type, TypeVar],
            function(cases, member) {
              return cases[member.tag].apply(null, member.values);
            });

        return Type;
      }
    );

    UnionType.Self = Self;

    return UnionType;
  };

  var UnionType = create({checkTypes: true, env: $.env});

  UnionType.create = create;

  return UnionType;

}));
