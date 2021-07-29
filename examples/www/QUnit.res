type description = string
type message = string

type result<'a> = {
  result: bool,
  actual: 'a,
  expected: 'a,
  message: string,
}

type assertion
type block = assertion => unit
type matcher<'a> = 'a => bool

// Library stuff

@send external expect: (assertion, int) => unit = "expect"
@send external pushResult: (assertion, result<'a>) => unit = "notOk"
@send external step: (assertion, description) => unit = "step"
@send external verifySteps: (assertion, array<description>) => unit = "verifySteps"

// Values

@send external equal: (assertion, 'a, 'a, description) => unit = "equal"
@send external notEqual: (assertion, 'a, 'a, description) => unit = "notEqual"

@send external isFalse: (assertion, 'a, description) => unit = "false"
@send external isTrue: (assertion, 'a, description) => unit = "true"

@send external deepEqual: (assertion, 'a, 'a, description) => unit = "deepEqual"
@send external notDeepEqual: (assertion, 'a, 'a, description) => unit = "notDeepEqual"

@send external strictEqual: (assertion, 'a, 'a, description) => unit = "strictEqual"
@send external notStrictEqual: (assertion, 'a, 'a, description) => unit = "notStrictEqual"

@send external ok: (assertion, 'a, 'a) => unit = "ok"
@send external notOk: (assertion, 'a, 'a) => unit = "notOk"

@send external propEqual: (assertion, 'a, 'a) => unit = "propEqual"
@send external notPropEqual: (assertion, 'a, 'a) => unit = "notPropEqual"

// Promises

type done = unit => unit

@send external async: assertion => done = "async"
@send external asyncMany: (assertion, int) => done = "async"
@send external rejects: (assertion, Js.Promise.t<'a>, message) => unit = "rejects"
@send external rejectsM: (assertion, Js.Promise.t<'a>, message) => unit = "rejects"
@send
external rejectMatches: (assertion, Js.Promise.t<'a>, matcher<'a>, message) => unit = "rejects"
@send
external rejectMatchesM: (assertion, Js.Promise.t<'a>, matcher<'a>, message) => unit = "rejects"
@send external timeout: (assertion, int) => unit = "timeout"

// Exceptions

@send external throws: (assertion, block, message) => unit = "throws"
@send
external throwMatches: (assertion, block, matcher<'a>, message) => unit = "throws"

type hooks
@send external before: (hooks, block) => unit = "before"
@send external beforeEach: (hooks, block) => unit = "beforeEach"
@send external afterEach: (hooks, block) => unit = "afterEach"
@send external after: (hooks, block) => unit = "after"

@module("qunit") @val external module_: (description, hooks => unit) => unit = "module"
@module("qunit") @val external test: (description, block) => unit = "test"
