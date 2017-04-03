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
  function identity(x) { return x; }

  //  values :: StrMap a -> Array a
  function values(o) {
    return Z.map(function(k) { return o[k]; }, Object.keys(o));
  }

  //  getTypeVarNames :: Type -> Array String
  function getTypeVarNames(t) {
    return t.type === 'VARIABLE' ?
      [t.name] :
      Z.reduce(function(typeVarNames, r) {
        return Z.concat(typeVarNames, getTypeVarNames(r.type));
      }, [], t.types);
  }

  //  uniq :: Array a -> Array a
  function uniq(xs) {
    return xs.reduce(function(xs, x) {
      return xs.indexOf(x) >= 0 ? xs : xs.concat([x]);
    }, []);
  }

  //  createUnusedTypeVar :: Array String -> Type
  function createUnusedTypeVar(typeVarNames) {
    for (var typeVarName = 'a';
         typeVarNames.indexOf(typeVarName) >= 0;
         typeVarName = String.fromCharCode(typeVarName.charCodeAt(0) + 1)) {}
    return $.TypeVariable(typeVarName);
  }

  //  recTypeRef :: String
  var recTypeRef = '@@functional/recursive-type-reference';

  //  Self :: PossiblyRecursiveType
  var Self = {types: {}}; Self[recTypeRef] = true;

  //  PossiblyRecursiveType :: Type
  var PossiblyRecursiveType = $.NullaryType(
    'sanctuary-union-type/PossiblyRecursiveType',
    function(x) {
      return x != null &&
             (x[recTypeRef] === true || x['@@type'] === 'sanctuary-def/Type');
    }
  );

  //  TypeName :: Type
  var TypeName = $.String;

  //  DataCtorDefs :: Type
  var DataCtorDefs = $.StrMap($.Array(PossiblyRecursiveType));

  //  Extractors :: Type
  var Extractors = $.StrMap($.AnyFunction);

  //  isFullyAppliedType :: a -> Boolean
  function isFullyAppliedType(x) {
    return x != null && x['@@type'] === 'sanctuary-def/Type';
  }

  //  Type :: Type
  var Type = $.NullaryType(
    'sanctuary-union-type/Type',
    function(x) {
      return (
        isFullyAppliedType(x) ||
        typeof x === 'function' && isFullyAppliedType(function() {
          var types = [];
          for (var idx = 0; idx < x.length; idx += 1) types.push($.Unknown);
          try { return x.apply(null, types); } catch (err) {}
        }())
      );
    }
  );

  //  fold :: StrMap (a -> b) -> a -> b
  function fold(cases) {
    return function(member) {
      return cases[member.tag].apply(null, member.values);
    };
  }

  function create(opts) {
    var def = $.create({checkTypes: true, env: $.env});

    function _UnionType(typeName, _cases, extractors$1, extractors$2) {
      function test(x) { return x != null && x['@@type'] === typeName; }

      var TypeConstructor_ = (function(arity) {
        switch (arity) {
          case 0: return $.NullaryType;
          case 1: return $.UnaryType;
          case 2: return $.BinaryType;
        }
      }(arguments.length - 2));

      var TypeConstructor = TypeConstructor_.apply(
        null,
        Z.concat([typeName, test],
                 Z.map(fold, Array.prototype.slice.call(arguments, 2)))
      );

      TypeConstructor.prototype = {'@@type': typeName};

      //  uniqTypeVarNames :: Array String
      var uniqTypeVarNames =
      uniq(Z.chain(getTypeVarNames, Z.chain(identity, values(_cases))));

      //  TypeVars :: Array Type
      var TypeVars = Z.map($.TypeVariable, uniqTypeVarNames);

      //  NullaryType :: Type
      var NullaryType = typeof TypeConstructor === 'function' ?
        TypeConstructor.apply(null, TypeVars) :
        TypeConstructor;

      var cases = Z.map(function(xs) {
        return Z.map(function(x) {
          return x[recTypeRef] === true ? NullaryType : x;
        }, xs);
      }, _cases);

      var env = Z.concat(opts.env, [NullaryType]);
      var def = $.create({checkTypes: opts.checkTypes, env: env});

      var unprefixedTypeName = typeName.slice(typeName.indexOf('/') + 1);

      Object.keys(cases).forEach(function(tag) {
        var types = values(cases[tag]);

        var construct =
        def(unprefixedTypeName + '.' + tag,
            {},
            Z.concat(types, [NullaryType]),
            function() {
              var o = Object.create(TypeConstructor.prototype);
              o.tag = tag;
              o.values = Array.prototype.slice.call(arguments);
              return o;
            });

        TypeConstructor[tag] = types.length === 0 ? construct() : construct;
      });

      //  TypeVar :: Type
      var TypeVar = createUnusedTypeVar(uniqTypeVarNames);

      //  RecordType :: Type
      var RecordType = $.RecordType(Z.map(function(types) {
        return $.Function(Z.concat(types, [TypeVar]));
      }, cases));

      TypeConstructor.fold =
      def(unprefixedTypeName + '.fold',
          {},
          [RecordType, NullaryType, TypeVar],
          function(cases, member) {
            return cases[member.tag].apply(null, member.values);
          });

      return TypeConstructor;
    }

    return {
      NullaryUnionType:
        def('NullaryUnionType',
            {},
            [TypeName, DataCtorDefs, Type],
            _UnionType),
      UnaryUnionType:
        def('UnaryUnionType',
            {},
            [TypeName, DataCtorDefs, Extractors, Type],
            _UnionType),
      BinaryUnionType:
        def('BinaryUnionType',
            {},
            [TypeName, DataCtorDefs, Extractors, Extractors, Type],
            _UnionType)
    };
  }

  var UnionType = create({checkTypes: true, env: $.env});

  UnionType.create = create;

  UnionType.Self = Self;

  return UnionType;

}));
