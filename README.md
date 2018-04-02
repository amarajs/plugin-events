## [@amarajs/plugin-events](https://github.com/amarajs/plugin-events)

Plugin middleware for AmaraJS to add events to DOM nodes dynamically.

### Installation

`npm install --save @amarajs/plugin-events`

### Usage

```javascript
import Amara from '@amarajs/core';
import AmaraEvents from '@amarajs/plugin-events';
import AmaraBrowser from '@amarajs/plugin-engine-browser';
const amara = new Amara([
    AmaraEvents(),
    AmaraBrowser()
]);
```

### Feature Type

The `@amarajs/plugin-events` middleware allows you to create features of type `"events"`.

#### Return Values

For `{type: "events"}` features, your apply function should return a map of event names to handler functions. You can also use CSS selectors (for [event delegation](https://davidwalsh.name/event-delegate)) in your key names:

```javascript
amara.add({
    type: 'events',
    targets: ['main'],
    apply: () => ({
        'click': (e) => {
            console.log('click bubbled up to main');
            e.preventDefault();
            e.stopPropagation();
        },
        'click div.active': (e) => {
            console.log('click fired on a <div class="active"> child');
            e.preventDefault();
            e.stopPropagation();
        },
        'click a[href^="#"], span[link]': (e) => {
            console.log('click fired on a child internal anchor -or- <span link>');
            e.preventDefault();
            e.stopPropagation();
        }
    })
});
```

### Dispatching Actions as Events

Event handlers can dispatch an `action` as if it were a DOM event. In this case, the action `"type"` will be used as the event name. These actions will bubble up the DOM like real events, so they can be handled by any interested parent nodes:

```javascript
amara.add({
    type: 'events',
    targets: ['#save'],
    apply: () => ({
        click: (e) => {
            // dispatch an action as if it
            // were a custom DOM event:
            e.dispatch(saveUserData());
            e.stopPropagation();
            e.preventDefault();
        }
    })
});
```

If an action is allowed to bubble all the way up to the node that was used to bootstrap your `amara` instance, then the `@amarajs/plugin-events` middleware will dispatch the action through AmaraJS, ensuring any other middleware that you registered has a chance to handle the action accordingly.

This enables contextual interception and modification of actions before they reach your middleware. For example, you could prevent an action from being dispatched to your [`@amarajs/plugin-redux`](https://github.com/amarajs/plugin-redux) middleware by simply stopping its propagation:

```javascript
amara.add({
    type: 'events',
    targets: ['main'],
    args: { saving: ({state}) => state.saving }
    apply: ({saving}) => ({
        // don't save user data if a
        // save is already in progress
        'save-user-data': (e) => {
            saving && e.stopPropagation();
        }
    })
});
```

### Lifecycle Events

There are a few special events you can register handlers for. These events will fire at specific moments you may want to tap into.

__NOTE:__ These events cannot be delegated. They will only fire on the target the feature applies to &mdash; they will _not_ bubble up the DOM to any parent nodes.

#### `"amara:add"`

This event fires the first time an `"events"` feature targets the specified DOM node. It is _not_ fired when the target is first inserted into the DOM.

```javascript
amara.add({
    type: 'events',
    target: ['main'],
    apply: () => ({
        'amara:add': (e) => {
            console.log('first "events" feature has been added to <main>');
            console.log('this handler will never fire again');
        }
    })
});
```

Note that AmaraJS waits to apply all newly added features until the end of the current stack frame. That means if you registered another `'amara:add'` handler to the same target within the current frame, it would also be invoked (in the order it was registered with your `amara` instance).

However, if you added an `'amara:add'` handler _after_ another `'events'` feature had already been applied to the same target, then it would NOT be invoked:

```javascript
// assume a previous 'events' feature was already added to main
setTimeout(() => {
    amara.add({
        type: 'events',
        target: ['main'],
        apply: () => ({
            'amara:add': (e) => {
                console.log('this will never fire');
            }
        })
    });
});
```

#### `"amara:remove"`

This event fires when the target is detached or removed from the DOM. For that reason, you will not have access to the full ancestor DOM tree in `e.target`:

```javascript
amara.add({
    type: 'events',
    targets: ['main'],
    apply: () => ({
        'amara:remove': (e) => {
            // e.target (<main>) has been removed from the DOM
            console.log(e.target.parentElement) // may not exist
        }
    });
});
```

You may be wondering: Why does `amara:remove` fire when a node is removed from the DOM but `amara:add` only fires the first time an `"events"` feature is registered for the given target?

Because event delegation isn't allowed for the built-in `amara:*` lifecycle events &mdash; in other words, because we don't bubble these special events &mdash; there is no reason to dispatch an `amara:add` event on a node that has no `"events"` features targeting it.

However, we still wanted to provide developers with an opportunity to "bootstrap" a given target node. For that reason, the first time you add an `"events"` feature to a given target, we will be sure to invoke an `amara:add` event you can hook into.

If you want a feature to _always_ run the first time is is created, but never more than once, use the `'amara:apply'` lifecycle (see below) and wrap your apply method in a utility method like lodash's `_.once`.

#### `"amara:apply"`

This event fires every time the AmaraJS engine believes a target's `"events"` features need to be re-applied. These handlers are a great place to dynamically modify your targets based on changing `args` values:

```javascript
amara.add({
    type: 'events',
    targets: ['#items'],
    args: { activeItem: ({state}) => state.activeItem },
    apply: ({ activeItem }) => ({
        'amara:apply': (e) => {
            // update the active list item every time activeItem changes
            if (activeItem)
                e.target.setAttribute('aria-activedescendant', activeItem.id);
            else
                e.target.removeAttribute('aria-activedescendant');
        }
    })
});
```

### KeyboardEvent Helpers

To make dealing with keyboard events easier, any `keydown`, `keyup`, or `keypress` handler can specify one or more [key values](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values) after the event name:

```javascript
amara.add({
    type: 'events',
    targets: ['input[type="text"]'],
    apply: () => ({
        'keydown.enter': (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dispatch(search(e.target.value));
        }
    })
});
```

You can also handle delegated events:

```javascript
amara.add({
    type: 'events',
    targets: ['main'],
    apply: () => ({
        'keydown.enter input[type="text"]': (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dispatch(search(e.target.value));
        }
    })
});
```

And a single handler for one or more possible keys:

```javascript
amara.add({
    type: 'events',
    targets: ['main'],
    apply: () => ({
        'keydown.enter.space': (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dispatch(activate(e.target.value));
        }
    })
});
```

To handle spacebar, use `"space"` as your key name:

```javascript
amara.add({
    type: 'events',
    targets: ['#todos'],
    apply: () => ({
        'keydown.space .todo': (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dispatch(toggle(e.target.id));
        }
    })
});
```

### MouseEvent Helpers

Any `mousedown` or `mouseup` handler can specify one or more [button values](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button) after the event name:

```javascript
amara.add({
    type: 'events',
    targets: ['input[type="text"]'],
    apply: () => ({
        'mousedown.2': (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dispatch(showContextMenu());
        }
    })
});
```

You can use the following friendly names rather than numeric values:

button | number | friendly name
--- | --- | ---
primary button | 0 | `"left"`
auxiliary button | 1 | `"middle"` or `"wheel"`
secondary button | 2 | `"right"`

```javascript
amara.add({
    type: 'events',
    targets: ['input[type="text"]'],
    apply: () => ({
        'mousedown.right': (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dispatch(showContextMenu());
        }
    })
});
```

Just as with `KeyboardEvent`s, you can use these helpers with delegation and also combine multiple helpers together, in which case the handler will be invoked when any of those mouse buttons is pressed.

### Applying Multiple Results to the Same Target

If multiple `{type: "events"}` features target the same DOM, the handlers will be added in the order the features were applied. The same handler (by reference) can be added to the same event type multiple times.

### Customization

This plugin has no customization options.

### Contributing

If you have a feature request, please create a new issue so the community can discuss it.

If you find a defect, please submit a bug report that includes a working link to reproduce the problem (for example, using [this fiddle](https://jsfiddle.net/04f3v2x4/)). Of course, pull requests to fix open issues are always welcome!

### License

The MIT License (MIT)

Copyright (c) Dan Barnes

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
