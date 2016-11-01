'use strict';

const assert = require('assert');

const $ = require('sanctuary-def');
const Z = require('sanctuary-type-classes');

const {NullaryUnionType, UnaryUnionType, BinaryUnionType, Self, create} = require('..');


//    always :: a -> () -> a
const always = x => () => x;

//    eq :: (a, b) -> Undefined !
const eq = (...args) => {
  assert.strictEqual(args.length, 2);
  const [actual, expected] = args;
  assert.strictEqual(Z.toString(actual), Z.toString(expected));
  assert.strictEqual(Z.equals(actual, expected), true);
};

//    throws :: (Function, TypeRep a, String) -> Undefined !
const throws = (...args) => {
  assert.strictEqual(args.length, 3);
  const [f, type, message] = args;
  assert.throws(f, err => err.constructor === type && err.message === message);
};


//    a :: Type
const a = $.TypeVariable('a');

//    b :: Type
const b = $.TypeVariable('b');

//    Point :: Type
const Point = NullaryUnionType(
  'my-package/Point',
  {Point: [$.Number, $.Number]}
);

//    Shape :: Type
const Shape = NullaryUnionType(
  'my-package/Shape',
  {Circle: [Point, $.Number], Rectangle: [Point, Point]}
);

//    List :: Type -> Type
const List = UnaryUnionType(
  'my-package/List',
  {Nil: [], Cons: [a, Self]},
  {Nil: () => [], Cons: (head, tail) => [head]}  // TODO: Support recursion here
);

//    Either :: Type -> Type -> Type
const Either = BinaryUnionType(
  'my-package/Either',
  {Left: [a], Right: [b]},
  {Left: x => [x], Right: x => []},
  {Left: x => [], Right: x => [x]}
);

const def = $.create({
  checkTypes: true,
  env: Z.concat($.env, [Point, Shape, List, Either]),
});

//    dist_ :: (Point, Point) -> Number
const dist_ = (p, q) =>
  Point.fold({
    Point: (x1, y1) => Point.fold({
      Point: (x2, y2) => Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2)),
    }, q),
  }, p);

//    dist :: Point -> Point -> Number
const dist = def('dist', {}, [Point, Point, $.Number], dist_);

//    area_ :: Shape -> Number
const area_ = Shape.fold({
  Circle: (p, r) => Math.PI * r * r,
  Rectangle: (p, q) => Point.fold({
    Point: (x1, y1) => Point.fold({
      Point: (x2, y2) => Math.abs(x1 - x2) * Math.abs(y1 - y2),
    }, q),
  }, p),
});

//    area :: Shape -> Number
const area = def('area', {}, [Shape, $.Number], area_);

//    showList_ :: List a -> String
const showList_ = List.fold({
  Cons: (head, tail) => `List.Cons(${Z.toString(head)}, ${showList(tail)})`,
  Nil: () => 'List.Nil',
});

//    showList :: List a -> String
const showList = def('showList', {}, [List(a), $.String], showList_);

//    showEither_ :: Either a b -> String
const showEither_ = Either.fold({
  Left: x => `Either.Left(${Z.toString(x)})`,
  Right: x => `Either.Right(${Z.toString(x)})`,
});

//    showEither :: Either a b -> String
const showEither = def('showEither', {}, [Either(a, b), $.String], showEither_);


test('TK', () => {
  throws(() => NullaryUnionType('my-package/Point', {Point: [Number, Number]}),
         TypeError,
         'Invalid value\n' +
         '\n' +
         'NullaryUnionType :: String -> StrMap (Array PossiblyRecursiveType) -> Type\n' +
         '                                            ^^^^^^^^^^^^^^^^^^^^^\n' +
         '                                                      1\n' +
         '\n' +
         '1)  function Number() { [native code] } :: Function\n' +
         '\n' +
         'The value at position 1 is not a member of ‘PossiblyRecursiveType’.\n');
});

test('defining a record type', () => {
  eq(dist_(Point.Point(0, 0), Point.Point(3, 4)), 5);
  eq(dist(Point.Point(0, 0), Point.Point(3, 4)), 5);
});

const equals = x => y => Z.equals(x, y);

test('TK', () => {
  const Maybe = UnaryUnionType(
    'my-package/Maybe',
    {Nothing: [], Just: [a]},
    {Nothing: () => [], Just: x => [x]}
  );

  Maybe.prototype.toString = function() {
    return Maybe.fold({
      Nothing: () => 'Nothing',
      Just: value => `Just(${Z.toString(value)})`,
    }, this);
  };

  Maybe.prototype['fantasy-land/equals'] = function(other) {
    return Maybe.fold({
      Nothing: () => Maybe.fold({Nothing: always(true), Just: always(false)}, other),
      Just: value => Maybe.fold({Nothing: always(false), Just: equals(value)}, other),
    }, this);
  };

  //    maybeMap :: (a -> b) -> Maybe a -> Maybe b
  const maybeMap = f => Maybe.fold({
    Nothing: () => Maybe.Nothing,
    Just: value => Maybe.Just(f(value)),
  });

  throws(() => Maybe.fold({}, Maybe.Nothing),
         TypeError,
         'Invalid value\n' +
         '\n' +
         'Maybe.fold :: { Just :: a -> b, Nothing :: () -> b } -> Maybe a -> b\n' +
         '              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n' +
         '                                1\n' +
         '\n' +
         '1)  {} :: Object, StrMap ???\n' +
         '\n' +
         'The value at position 1 is not a member of ‘{ Just :: a -> b, Nothing :: () -> b }’.\n');

  eq(maybeMap(Math.sqrt)(Maybe.Nothing), Maybe.Nothing);
  eq(maybeMap(Math.sqrt)(Maybe.Just(9)), Maybe.Just(3));
});

test('Fields can be described in terms of other types', () => {
  eq(area_(Shape.Circle(Point.Point(0, 0), 10)), 100 * Math.PI);
  eq(area_(Shape.Rectangle(Point.Point(3, 4), Point.Point(7, 7))), 12);
  eq(area(Shape.Circle(Point.Point(0, 0), 10)), 100 * Math.PI);
  eq(area(Shape.Rectangle(Point.Point(3, 4), Point.Point(7, 7))), 12);
});

test('If a field value does not match the spec an error is thrown', () => {
  throws(() => { Point.Point(4, 'foo'); },
         TypeError,
         'Invalid value\n' +
         '\n' +
         'Point.Point :: Number -> Number -> Point\n' +
         '                         ^^^^^^\n' +
         '                           1\n' +
         '\n' +
         '1)  "foo" :: String\n' +
         '\n' +
         'The value at position 1 is not a member of ‘Number’.\n');

  const Foo = UnaryUnionType(
    'my-package/Foo',
    {Foo: [$.Array(b), $.Array(b)]},
    {Foo: Z.concat}
  );

  throws(() => Foo.Foo(['a', 'b', 'c'], [1, 2, 3]),
         TypeError,
         'Type-variable constraint violation\n' +
         '\n' +
         'Foo.Foo :: Array b -> Array b -> Foo b\n' +
         '                 ^          ^\n' +
         '                 1          2\n' +
         '\n' +
         '1)  "a" :: String\n' +
         '    "b" :: String\n' +
         '    "c" :: String\n' +
         '\n' +
         '2)  1 :: Number\n' +
         '    2 :: Number\n' +
         '    3 :: Number\n' +
         '\n' +
         'Since there is no type of which all the above values are members, the type-variable constraint has been violated.\n');

  throws(() => Foo.fold({}, Foo.Foo([1, 2, 3], [4, 5, 6])),
         TypeError,
         'Invalid value\n' +
         '\n' +
         'Foo.fold :: { Foo :: (Array b, Array b) -> a } -> Foo b -> a\n' +
         '            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n' +
         '                            1\n' +
         '\n' +
         '1)  {} :: Object, StrMap ???\n' +
         '\n' +
         'The value at position 1 is not a member of ‘{ Foo :: (Array b, Array b) -> a }’.\n');
});

test('Recursive Union Types', () => {
  eq(showList_(List.Nil), 'List.Nil');
  eq(showList_(List.Cons(1, List.Cons(2, List.Cons(3, List.Nil)))), 'List.Cons(1, List.Cons(2, List.Cons(3, List.Nil)))');
  eq(showList(List.Nil), 'List.Nil');
  eq(showList(List.Cons(1, List.Cons(2, List.Cons(3, List.Nil)))), 'List.Cons(1, List.Cons(2, List.Cons(3, List.Nil)))');
});

test('TK', () => {
  eq(showEither_(Either.Left('XXX')), 'Either.Left("XXX")');
  eq(showEither_(Either.Right([42])), 'Either.Right([42])');
  eq(showEither(Either.Left('XXX')), 'Either.Left("XXX")');
  eq(showEither(Either.Right([42])), 'Either.Right([42])');
});

test('Disabling Type Checking', () => {
  const {NullaryUnionType} = create({checkTypes: false, env: $.env});
  const Point = NullaryUnionType('my-package/Point', {Point: [$.Number, $.Number]});

  eq(Point.fold({Point: (x, y) => x + y}, Point.Point('foo', 'bar')), 'foobar');
});
