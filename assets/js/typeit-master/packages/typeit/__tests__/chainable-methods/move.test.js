import TypeIt from "../../src";
import * as wait from "../../src/helpers/wait";
import * as repositionCursor from "../../src/helpers/repositionCursor";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("timeouts fire correctly", () => {
  let waitSpy;
  let element;

  beforeEach(() => {
    setHTML`<div>
      <span id="element"></span>
    </div>`;

    waitSpy = jest.spyOn(wait, "default");
    element = document.getElementById("element");
  });

  it("Waits correct number of times when it's not instant.", (done) => {
    new TypeIt("#element", {
      strings: "abc",
      speed: 1,
      afterComplete: () => {
        expect(waitSpy).toHaveBeenCalledTimes(6);
        done();
      },
    })
      .move(-2)
      .go();
  });

  it("Combines moves in same function when instant.", (done) => {
    new TypeIt("#element", {
      strings: "abc",
      speed: 1,
      afterComplete: () => {
        expect(waitSpy).toHaveBeenCalledTimes(4);
        done();
      },
    })
      .move(-3, { instant: true })
      .go();
  });

  it("Moves to element via selector.", (done) => {
    setHTML`<div>
      <span id="element"></span>
    </div>`;

    new TypeIt("#element", {
      strings: "A <strong>B</strong> C",
      speed: 1,
      afterComplete: () => {
        expect(waitSpy).toHaveBeenCalledTimes(9);
        done();
      },
    })
      .move("strong")
      .go();
  });
});

describe("moves only within range", () => {
  let repositionCursorSpy;

  beforeEach(() => {
    setHTML`<div>
      <span id="element"></span>
    </div>`;

    repositionCursorSpy = jest.spyOn(repositionCursor, "default");
  });

  it("bottom end of range", (done) => {
    new TypeIt("#element", {
      speed: 0,
      afterComplete: () => {
        expect(repositionCursorSpy.mock.calls).toEqual([
          [expect.objectContaining(element), expect.any(Array), 0],
          [expect.objectContaining(element), expect.any(Array), 0],
        ]);
        done();
      },
    })
      .type("Hi!")
      .move(2) // Number of steps is out of range of printed characters.
      .go();
  });

  it("top end of range", (done) => {
    new TypeIt("#element", {
      speed: 0,
      afterComplete: () => {
        expect(repositionCursorSpy.mock.calls).toEqual([
          [expect.objectContaining(element), expect.any(Array), 1],
          [expect.objectContaining(element), expect.any(Array), 2],
          [expect.objectContaining(element), expect.any(Array), 3],
          [expect.objectContaining(element), expect.any(Array), 3],
        ]);
        done();
      },
    })
      .type("Hi!")
      .move(-4) // Number of steps is out of range of printed characters.
      .go();
  });
});
