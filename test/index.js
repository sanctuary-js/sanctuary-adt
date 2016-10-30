'use strict';

const assert = require('assert');

const R = require('ramda');
const $ = require('sanctuary-def');
const Z = require('sanctuary-type-classes');

const UnionType = require('..');


const a = $.TypeVariable('a');

const UT = UnionType({checkTypes: true, env: $.env});

const Type = UT.Anonymous;
const Named = UT.Named;
const Class = UT.Class;

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


test('defining a union type with predicates', () => {
  const Num = $.NullaryType('my-package/Num', x => typeof x === 'number');
  const Point = Type({Point: [Num, Num]});
  const p = Point.Point(2, 3);
  const [x, y] = p;

  eq([x, y], [2, 3]);
});

test('defining a union type with built ins', () => {
  const I = R.identity;
  [
    [2, $.Number, I],
    ['2', $.String, I],
    [true, $.Boolean, I],
    [{a: 1}, $.Object, I],
    [[0, 1, 2], $.Array($.Any), I],
    [() => 1, $.AnyFunction, f => f()],
  ]
  .forEach(
    ([expected, $, f]) => {
      const Class = Type({$: [$]});
      const instance = Class.$(expected);
      const actual = instance[0];

      eq(f(actual), f(expected));
    }
  );
});

test('defining a record type', () => {
  const Point = Type({Point: {x: $.Number, y: $.Number}});
  const [x, y] = Point.Point(2, 3);
  const [x1, y1] = Point.PointOf({x: 2, y: 3});

  eq([x, y], [x1, y1]);
});

test('create instance methods declaratively', () => {
  const Maybe = Class('my-package/Maybe', {Just: [a], Nothing: []}, {
    'fantasy-land/equals'(other) {
      return this._name === 'Nothing' ?
        other._name === 'Nothing' :
        other._name === 'Just' && Z.equals(other[0], this[0]);
    },
    map(f) {
      return Maybe.case({Nothing: R.always(Nothing), Just: R.compose(Just, f)},
                        this);
    },
  });

  const Nothing = Maybe.Nothing();
  const Just = Maybe.Just;

  eq(Nothing.map(Math.sqrt), Nothing);
  eq(Just(9).map(Math.sqrt), Just(3));
});

test('Fields can be described in terms of other types', () => {
  const Point = Type({Point: {x: $.Number, y: $.Number}});

  const Shape = Type({
    Circle: [$.Number, Point],
    Rectangle: [Point, Point],
  });

  const [radius, [x, y]] = Shape.Circle(4, Point.Point(2, 3));

  eq([radius, x, y], [4, 2, 3]);
});

test('The values of a type can also have no fields at all', () => {
  const NotifySetting = Type({Mute: [], Vibrate: [], Sound: [$.Number]});

  eq('Mute', NotifySetting.Mute()._name);
});

test('If a field value does not match the spec an error is thrown', () => {
  const Point = Named('my-package/Point', {Point: {x: $.Number, y: $.Number}});

  throws(() => { Point.Point(4, 'foo'); },
         TypeError,
         'Invalid value\n' +
         '\n' +
         'Point.Point :: Number -> Number -> { x :: Number, y :: Number }\n' +
         '                         ^^^^^^\n' +
         '                           1\n' +
         '\n' +
         '1)  "foo" :: String\n' +
         '\n' +
         'The value at position 1 is not a member of ‘Number’.\n');
});

test('Switching on union types', () => {
  const Action = Type({Up: [], Right: [], Down: [], Left: []});
  const player = {x: 0, y: 0};

  const advancePlayer = (action, player) =>
    Action.case({
      Up: () => ({x: player.x, y: player.y - 1}),
      Right: () => ({x: player.x + 1, y: player.y}),
      Down: () => ({x: player.x, y: player.y + 1}),
      Left: () => ({x: player.x - 1, y: player.y}),
    }, action);

  eq(advancePlayer(Action.Up(), player), {x: 0, y: -1});
});

test('Switch on union types point free', () => {
  const Point = Type({Point: {x: $.Number, y: $.Number}});

  const Shape = Type({
    Circle: [$.Number, Point],
    Rectangle: [Point, Point],
  });

  const p1 = Point.PointOf({x: 0, y: 0});
  const p2 = Point.PointOf({x: 10, y: 10});

  {
    const area = Shape.case({
      Circle: (radius, _) => Math.PI * radius * radius,
      Rectangle: (p1, p2) => (p2.x - p1.x) * (p2.y - p1.y),
    });

    eq(area(Shape.Rectangle(p1, p2)), 100);
  }

  {
    const area = Shape.Rectangle(p1, p2).case({
      Circle: (radius, _) => Math.PI * radius * radius,
      Rectangle: (p1, p2) => (p2.x - p1.x) * (p2.y - p1.y),
    });

    eq(area, 100);
  }
});

test('Destructuring assignment to extract values', () => {
  const Point = Type({Point: {x: $.Number, y: $.Number}});
  const [x, y] = Point.PointOf({x: 0, y: 0});

  eq({x, y}, {x: 0, y: 0});
});

test('Recursive Union Types', () => {
  const List = Type({Nil: [], Cons: [a, undefined]});

  const toString = List.case({
    Cons: (head, tail) => `${head} : ${toString(tail)}`,
    Nil: () => 'Nil',
  });

  const list = List.Cons(1, List.Cons(2, List.Cons(3, List.Nil())));

  eq(toString(list), '1 : 2 : 3 : Nil');
});

test('Disabling Type Checking', () => {
  const Type = UnionType({checkTypes: false, env: $.env}).Anonymous;
  const Point = Type({Point: {x: $.Number, y: $.Number}});
  const p = Point.Point('foo', 4);

  eq(p.x, 'foo');
});

test('Use placeholder for cases without matches', () => {
  const List = Type({Nil: [], Cons: [a, undefined]});

  eq(List.case({Cons: () => 'Cons', _: () => 'Nil'}, List.Nil()), 'Nil');
  eq(List.Nil().case({Cons: () => 'Cons', _: () => 'Nil'}), 'Nil');
});

test('Create a Type with no cases', () => {
  Type({});
});

test('Can iterate through a instance\'s values', () => {
  const T = Type({Values: [$.Number, $.Number, $.Number]});
  const instance = T.Values(1, 2, 3);
  const results = [];
  for (const x of instance) results.push(x);
  eq(results, [1, 2, 3]);
});
