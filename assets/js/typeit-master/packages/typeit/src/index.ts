import Queue from "./Queue";
import { maybeChunkStringAsHtml } from "./helpers/chunkStrings";
import expandTextNodes from "./helpers/expandTextNodes";
import appendStyleBlock from "./helpers/appendStyleBlock";
import asArray from "./helpers/asArray";
import calculateDelay from "./helpers/calculateDelay";
import calculatePace from "./helpers/calculatePace";
import createElement from "./helpers/createElement";
import destroyTimeouts from "./helpers/destroyTimeouts";
import generateHash from "./helpers/generateHash";
import getAllChars from "./helpers/getAllChars";
import fireWhenVisible from "./helpers/fireWhenVisible";
import getParsedBody from "./helpers/getParsedBody";
import handleFunctionalArg from "./helpers/handleFunctionalArg";
import isNumber from "./helpers/isNumber";
import insertIntoElement from "./helpers/insertIntoElement";
import isInput from "./helpers/isInput";
import updateCursorPosition from "./helpers/updateCursorPosition";
import merge from "./helpers/merge";
import removeNode from "./helpers/removeNode";
import repositionCursor from "./helpers/repositionCursor";
import selectorToElement from "./helpers/selectorToElement";
import isNonVoidElement from "./helpers/isNonVoidElement";
import wait from "./helpers/wait";
import { setCursorStyles } from "./helpers/setCursorStyles";
import {
  Element,
  Options,
  QueueItem,
  ActionOpts,
  TypeItInstance,
} from "./types";
import {
  CURSOR_CLASS,
  DEFAULT_STATUSES,
  DEFAULT_OPTIONS,
  DATA_ATTRIBUTE,
} from "./contants";
import duplicate from "./helpers/duplicate";
import countStepsToSelector from "./helpers/countStepsToSelector";

// Necessary for publicly exposing types.
export declare type TypeItOptions = Options;

const TypeIt: TypeItInstance = function (element, options = {}) {
  let _wait = async (
    callback: Function,
    delay: number,
    silent: boolean = false
  ) => {
    if (_statuses.frozen) {
      await new Promise<void>((resolve) => {
        this.unfreeze = () => {
          _statuses.frozen = false;
          resolve();
        };
      });
    }

    silent || (await _opts.beforeStep(this));

    await wait(callback, delay, _timeouts);

    silent || (await _opts.afterStep(this));
  };

  let _elementIsInput = () => isInput(_element);

  let _getPace = (index: number = 0): number => calculatePace(_opts)[index];

  let _getAllChars = (): Element[] => getAllChars(_element);

  let _maybeAppendPause = (opts: ActionOpts = {}) => {
    let delay = opts.delay;
    delay && _queue.add({ delay });
  };

  let _queueAndReturn = (steps: QueueItem[] | QueueItem, opts: ActionOpts) => {
    _queue.add(steps);
    _maybeAppendPause(opts);

    return this;
  };

  let _generateTemporaryOptionQueueItems = (
    newOptions: Options = {}
  ): QueueItem[] => {
    return [
      { func: () => _options(newOptions) },
      { func: () => _options(_opts) },
    ];
  };

  /**
   * Add items to the queue with a split pause
   * wrapped around them.
   */
  let _addSplitPause = (item: QueueItem) => {
    let delay = _opts.nextStringDelay;

    _queue.add([{ delay: delay[0] }, item, { delay: delay[1] }]);
  };

  /**
   * Provided it's a non-form element and the options is provided,
   * set up the cursor element for the
   */
  let _setUpCursor = (): void | Element => {
    if (_elementIsInput()) {
      return;
    }

    // If we have a cursor node from a previous instance (prior to a reset()),
    // there's no need to recreate one now.
    let cursor = createElement("span");
    cursor.className = CURSOR_CLASS;

    // Don't bother touching up the cursor if we don't want it to visibly render anyway.
    if (!_shouldRenderCursor) {
      cursor.style.visibility = "hidden";

      return cursor as Element;
    }

    cursor.innerHTML = getParsedBody(_opts.cursorChar).innerHTML;

    return cursor as Element;
  };

  /**
   * Attach it to the DOM so, along with the required CSS transition.
   */
  let _attachCursor = async () => {
    !_elementIsInput() && _cursor && _element.appendChild(_cursor);

    _shouldRenderCursor && setCursorStyles(_id, _opts, _element);
  };

  let _disableCursorBlink = (shouldDisable: boolean): void => {
    if (_shouldRenderCursor && _cursor) {
      _cursor.classList.toggle("disabled", shouldDisable);
      _cursor.classList.toggle("with-delay", !shouldDisable);
    }
  };

  /**
   * Based on provided strings, generate a TypeIt queue
   * to be fired for each character in the string.
   */
  let _generateQueue = () => {
    let strings = _opts.strings.filter((string) => !!string);

    strings.forEach((string, index) => {
      this.type(string);

      // This is the last string. Get outta here.
      if (index + 1 === strings.length) {
        return;
      }

      _addSplitPause({
        func: _opts.breakLines ? () => _type(createElement("BR")) : _delete,
        typeable: !!_opts.breakLines
      });
    });
  };

  /**
   * 1. Reset queue.
   * 2. Reset initial pause.
   */
  let _prepLoop = async (delay: number) => {
    _cursorPosition && (await _move({ value: _cursorPosition }));

    for (let _i of _queue.getTypeable()) {
      await _wait(_delete, _getPace(1));
    }

    _queue.reset();
    _queue.set(0, { delay });
  };

  let _maybePrependHardcodedStrings = (strings): string[] => {
    let existingMarkup = _element.innerHTML;

    if (!existingMarkup) {
      return strings;
    }

    // Once we've saved the existing markup to a variable,
    // wipe the element clean to prepare for typing.
    _element.innerHTML = "";

    if (_opts.startDelete) {
      _element.innerHTML = existingMarkup;
      expandTextNodes(_element);
      _addSplitPause({ func: _delete });

      return strings;
    }

    let hardCodedStrings = existingMarkup.trim().split(/<br(?:\s*?)(?:\/)?>/);

    return hardCodedStrings.concat(strings);
  };

  let _fire = async (): Promise<void> => {
    _statuses.started = true;

    let queueItems = _queue.getItems();

    // @todo remove this eventually..
    // console.log(
    //   "Total time:",
    //   queueItems.reduce((total, step) => {
    //     total = total + step.delay;

    //     return total;
    //   }, 0)
    // );

    try {
      for (let i = 0; i < queueItems.length; i++) {
        let queueItem = queueItems[i];

        queueItem.delay = queueItem.delay || 0;
        queueItem.typeable && _disableCursorBlink(true);

        // Only break up the event loop if needed.
        let execute = async () => queueItem.func?.call(this);

        if (queueItem.delay) {
          await _wait(async () => {
            await execute();
          }, queueItem.delay);
        } else {
          await execute();
        }

        _queue.markDone(i);
        _disableCursorBlink(false);
      }

      _statuses.completed = true;

      await _opts.afterComplete(this);

      if (!_opts.loop) {
        throw "";
      }

      let delay = _opts.loopDelay;

      _wait(async () => {
        await _prepLoop(delay[0]);
        _fire();
      }, delay[1]);
    } catch (e) {}

    return this;
  };

  /**
   * Move type cursor by a given number.
   */
  let _move = async (step): Promise<void> => {
    _cursorPosition = updateCursorPosition(
      step,
      _cursorPosition,
      _getAllChars()
    );

    repositionCursor(_element, _getAllChars(), _cursorPosition);
  };

  /**
   * Insert a single or many characters into the target element.
   */
  let _type = (char): void => insertIntoElement(_element, char);

  let _options = async (opts) => (_opts = merge(_opts, opts));

  let _empty = async () => {
    if (_elementIsInput()) {
      _element.value = "";
      return;
    }

    _getAllChars().forEach(removeNode);

    return;
  };

  let _delete = (): void => {
    let allChars = _getAllChars();

    if (!allChars.length) return;

    if (_elementIsInput()) {
      _element.value = (_element.value as string).slice(0, -1);
    } else {
      removeNode(allChars[_cursorPosition]);
    }
  };

  this.break = function (actionOpts: ActionOpts) {
    return _queueAndReturn(
      {
        func: () => _type(createElement("BR")),
        typeable: true,
      },
      actionOpts
    );
  };

  this.delete = function (
    numCharacters: number | string | (() => number | null) = null,
    actionOpts: ActionOpts = {}
  ) {
    numCharacters = handleFunctionalArg<number>(numCharacters);
    let bookEndQueueItems = _generateTemporaryOptionQueueItems(actionOpts);
    let num = numCharacters;
    let { instant, to } = actionOpts;
    let typeableQueueItems = _queue.getTypeable();

    let rounds = (() => {
      if (num === null) {
        return typeableQueueItems.length;
      }

      if (isNumber(num)) {
        return num;
      }

      // The -1 offset is necessary because the empty element is what
      // will be found, and we want to delete an actual character...
      // not something that's empty.
      return countStepsToSelector({
        queueItems: typeableQueueItems,
        selector: num,
        cursorPosition: _predictedCursorPosition,
        to,
      })
    })();

    return _queueAndReturn(
      [
        bookEndQueueItems[0],
        ...duplicate(
          {
            func: _delete,
            delay: instant ? 0 : _getPace(1),
          },
          rounds
        ),
        bookEndQueueItems[1],
      ],
      actionOpts
    );
  };

  this.empty = function (actionOpts: ActionOpts = {}) {
    return _queueAndReturn({ func: _empty }, actionOpts);
  };

  this.exec = function (
    func: (instance: TypeItInstance) => any,
    actionOpts: ActionOpts = {}
  ) {
    let bookEndQueueItems = _generateTemporaryOptionQueueItems(actionOpts);

    return _queueAndReturn(
      [bookEndQueueItems[0], { func: () => func(this) }, bookEndQueueItems[1]],
      actionOpts
    );
  };

  this.move = function (
    movementArg: string | number | (() => string | number),
    actionOpts: ActionOpts = {}
  ) {
    movementArg = handleFunctionalArg<string | number>(movementArg);

    let bookEndQueueItems = _generateTemporaryOptionQueueItems(actionOpts);
    let { instant, to } = actionOpts;
    let numberOfSteps = countStepsToSelector({
      queueItems: _queue.getTypeable(),
      selector: movementArg === null ? "" : movementArg,
      to,
      cursorPosition: _cursorPosition,
    });
    let directionalStep = numberOfSteps < 0 ? -1 : 1;

    _predictedCursorPosition = _cursorPosition + numberOfSteps;

    return _queueAndReturn(
      [
        bookEndQueueItems[0],
        ...duplicate(
          {
            func: () => _move(directionalStep),
            delay: instant ? 0 : _getPace(),
          },
          Math.abs(numberOfSteps)
        ),
        bookEndQueueItems[1],
      ],
      actionOpts
    );
  };

  this.options = function (
    opts: Options | (() => Options),
    actionOpts: ActionOpts = {}
  ) {
    opts = handleFunctionalArg<Options>(opts);

    _options(opts);

    return _queueAndReturn({}, actionOpts);
  };

  this.pause = function (
    milliseconds: number | (() => number),
    actionOpts: ActionOpts = {}
  ) {
    return _queueAndReturn(
      { delay: handleFunctionalArg<number>(milliseconds) },
      actionOpts
    );
  };

  this.type = function (
    string: string | (() => string),
    actionOpts: ActionOpts = {}
  ) {
    string = handleFunctionalArg<string>(string);

    let { instant } = actionOpts;
    let bookEndQueueItems = _generateTemporaryOptionQueueItems(actionOpts);
    let chars = maybeChunkStringAsHtml(string, _opts.html);

    let charsAsQueueItems = chars.map((char): QueueItem => {
      return {
        func: () => _type(char),
        char,
        delay: instant || isNonVoidElement(char) ? 0 : _getPace(),
        typeable: char.nodeType === Node.TEXT_NODE,
      };
    });

    let itemsToQueue = [
      bookEndQueueItems[0],
      { func: async () => await _opts.beforeString(string, this) },
      ...charsAsQueueItems,
      { func: async () => await _opts.afterString(string, this) },
      bookEndQueueItems[1],
    ];

    return _queueAndReturn(itemsToQueue, actionOpts);
  };

  this.is = function (key): boolean {
    return _statuses[key];
  };

  this.destroy = function (shouldRemoveCursor = true) {
    _timeouts = destroyTimeouts(_timeouts);
    handleFunctionalArg<boolean>(shouldRemoveCursor) &&
      _cursor &&
      removeNode(_cursor);
    _statuses.destroyed = true;
  };

  this.freeze = function () {
    _statuses.frozen = true;
  };

  this.unfreeze = function () {};

  this.reset = function (rebuild: ((TypeIt) => typeof TypeIt) | undefined) {
    !this.is("destroyed") && this.destroy();

    // If provided, the queue can be totally regenerated.
    if (rebuild) {
      _queue.wipe();
      rebuild(this);
    } else {
      _queue.reset();
    }

    _cursorPosition = 0;

    for (let property in _statuses) {
      _statuses[property] = false;
    }

    _element[_elementIsInput() ? "value" : "innerHTML"] = "";

    return this;
  };

  this.go = function () {
    if (_statuses.started) {
      return this;
    }

    _attachCursor();

    if (!_opts.waitUntilVisible) {
      _fire();
      return this;
    }

    fireWhenVisible(_element, _fire.bind(this));

    return this;
  };

  this.getQueue = () => _queue;
  this.getOptions = () => _opts;
  this.updateOptions = (options: Options) => _options(options);
  this.getElement = () => _element;

  let _element = selectorToElement(element);
  let _timeouts: number[] = [];
  let _cursorPosition = 0;
  let _predictedCursorPosition = 0;
  let _statuses = merge({}, DEFAULT_STATUSES);

  let _opts: Options = merge(DEFAULT_OPTIONS, options);
  _opts = merge(_opts, {
    html: !_elementIsInput() && _opts.html,
    nextStringDelay: calculateDelay(_opts.nextStringDelay),
    loopDelay: calculateDelay(_opts.loopDelay),
  });

  let _id = generateHash();
  let _queue = Queue([
    {
      func: () => {},
      delay: _opts.startDelay,
    },
  ]);

  _element.dataset.typeitId = _id;

  // Used to set a "placeholder" space in the element, so that it holds vertical sizing before anything's typed.
  appendStyleBlock(
    `[${DATA_ATTRIBUTE}]:before {content: '.'; display: inline-block; width: 0; visibility: hidden;}`
  );

  let _shouldRenderCursor = _opts.cursor && !_elementIsInput();
  let _cursor = _setUpCursor();

  _opts.strings = _maybePrependHardcodedStrings(asArray<string>(_opts.strings));

  // Only generate a queue if we have strings
  // and this isn't a reset of a previous instance,
  // in which case we'd have a pre-defined queue.
  if (_opts.strings.length) {
    _generateQueue();
  }
};

export default TypeIt;
