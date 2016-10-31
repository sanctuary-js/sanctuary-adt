'use strict';

const assert = require('assert');

const $ = require('sanctuary-def');
const Z = require('sanctuary-type-classes');

const UnionType = require('..');


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

//    Point :: Type
const Point = UnionType('my-package/Point', {
  Point: [$.Number, $.Number],
});

//    Shape :: Type
const Shape = UnionType('my-package/Shape', {
  Circle: [Point, $.Number],
  Rectangle: [Point, Point],
});

//    List :: Type
const List = UnionType('my-package/List', {
  Nil: [],
  Cons: [a, UnionType.Self],
});

const def = $.create({
  checkTypes: true,
  env: Z.concat($.env, [Point, Shape, List]),
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

//    showList :: List a -> String
const showList = List.fold({
  Cons: (head, tail) => `Cons(${head}, ${showList(tail)})`,
  Nil: () => 'Nil',
});


test('TK', () => {
  throws(() => UnionType('my-package/Point', {Point: [Number, Number]}),
         TypeError,
         'Invalid value\n' +
         '\n' +
         'UnionType :: String -> StrMap (Array Type) -> Type\n' +
         '                                     ^^^^\n' +
         '                                      1\n' +
         '\n' +
         '1)  function Number() { [native code] } :: Function\n' +
         '\n' +
         'The value at position 1 is not a member of ‘Type’.\n');
});

test('defining a record type', () => {
  eq(dist_(Point.Point(0, 0), Point.Point(3, 4)), 5);
  eq(dist(Point.Point(0, 0), Point.Point(3, 4)), 5);
});

const equals = x => y => Z.equals(x, y);

test('TK', () => {
  const Maybe = UnionType('my-package/Maybe', {Nothing: [], Just: [a]});

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
         'Maybe.fold :: { Just :: a -> b, Nothing :: () -> b } -> Maybe -> b\n' +
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

  const Foo = UnionType('my-package/Foo', {Foo: [$.Array(a), $.Array(a)]});

  throws(() => Foo.Foo(['a', 'b', 'c'], [1, 2, 3]),
         TypeError,
         'Type-variable constraint violation\n' +
         '\n' +
         'Foo.Foo :: Array a -> Array a -> Foo\n' +
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
         'Foo.fold :: { Foo :: (Array a, Array a) -> b } -> Foo -> b\n' +
         '            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n' +
         '                            1\n' +
         '\n' +
         '1)  {} :: Object, StrMap ???\n' +
         '\n' +
         'The value at position 1 is not a member of ‘{ Foo :: (Array a, Array a) -> b }’.\n');
});

test('Recursive Union Types', () => {
  eq(showList(List.Nil), 'Nil');
  eq(showList(List.Cons(1, List.Cons(2, List.Cons(3, List.Nil)))), 'Cons(1, Cons(2, Cons(3, Nil)))');
});

test('Disabling Type Checking', () => {
  const UncheckedUnionType = UnionType.create({checkTypes: false, env: $.env});
  const Point = UncheckedUnionType('my-package/Point', {Point: [$.Number, $.Number]});

  eq(Point.fold({Point: (x, y) => x + y}, Point.Point('foo', 'bar')), 'foobar');
});
