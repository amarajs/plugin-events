const sinon = require('sinon');
const expect = require('chai').expect;
const JSDOM = require('jsdom').JSDOM;

const Events = require('../dist/amara-plugin-events');

describe('Events', function() {

    function apply(target, ...maps) {
        return {
            type: 'core:apply-target-results',
            payload: {
                events: new Map([
                    [target, maps]
                ])
            }
        };
    }

    beforeEach(function createHandler() {
        this.dispatch = sinon.spy();
        this.handler = Events()(this.dispatch);
        this.window = global.window = (new JSDOM('')).window;
        this.div = () => this.window.document.createElement('div');
        this.fire = (target, name, detail = null, initArgs = {
            bubbles: true,
            cancelable: true,
            composed: true
        }, Type = this.window.CustomEvent) => {
            initArgs.detail = detail;
            this.e = new Type(name, initArgs);
            return target.dispatchEvent(this.e);
        };
    });

    describe('handler', function() {

        it('runs for direct event', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {click: spy}));
            this.fire(div, 'click');
            expect(spy.calledOnce).true;
        });

        it('runs in order applied', function() {
            const div = this.div();
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();
            this.handler(apply(div, {click: spy1}, {click: spy2}));
            this.fire(div, 'click');
            expect(spy2.calledOnce).true;
            expect(spy1.calledBefore(spy2)).true;
        });

        it('runs for all events', function() {
            const div = this.div();
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();
            this.handler(apply(div, {
                click: spy1,
                custom: spy2
            }));
            this.fire(div, 'click');
            expect(spy1.calledOnce).true;
            expect(spy2.called).false;
            spy1.reset();
            this.fire(div, 'custom');
            expect(spy1.called).false;
            expect(spy2.calledOnce).true;
        });

        it('runs for bubbled event', function() {
            const parent = this.div();
            const child = this.div();
            const spy = sinon.spy();
            parent.appendChild(child);
            this.handler(apply(parent, {click: spy}));
            this.fire(child, 'click');
            expect(spy.calledOnce).true;
        });

        it('runs for matching delegated event', function() {
            const parent = this.div();
            const child = this.div();
            const spy = sinon.spy();
            child.setAttribute('custom', '');
            parent.appendChild(child);
            this.handler(apply(parent, {'click div[custom]': spy}));
            this.fire(child, 'click');
            expect(spy.calledOnce).true;
        });

        it('runs for secondary delegated target', function() {
            const parent = this.div();
            const child = this.div();
            const spy = sinon.spy();
            child.setAttribute('custom', '');
            parent.appendChild(child);
            this.handler(apply(parent, {'click a[href^="#"], div[custom]': spy}));
            this.fire(child, 'click');
            expect(spy.calledOnce).true;
        });

        it('does not run for non-matching delegated event', function() {
            const parent = this.div();
            const child = this.div();
            const spy = sinon.spy();
            child.setAttribute('custom', '');
            parent.appendChild(child);
            this.handler(apply(parent, {'click div[dne]': spy}));
            this.fire(child, 'click');
            expect(spy.called).false;
        });

        it('does not run for stopped bubbled event', function() {
            const parent = this.div();
            const child = this.div();
            const spy = sinon.spy();
            parent.appendChild(child);
            this.handler(apply(child, {click: (e) => e.stopPropagation()}));
            this.handler(apply(parent, {click: spy}));
            this.fire(child, 'click');
            expect(spy.called).false;
        });

        it('does not run for immediate stopped direct event', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div,
                {click: (e) => e.stopImmediatePropagation()},
                {click: spy}
            ));
            this.fire(div, 'click');
            expect(spy.called).false;
        });

        it('runs same handler for multiple events', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {
                click: spy,
                custom: spy
            }));
            this.fire(div, 'click');
            this.fire(div, 'custom');
            expect(spy.calledTwice).true;
        });

        it('runs each handler the number of times it was added', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {click: spy}, {click: spy}));
            this.fire(div, 'click');
            expect(spy.calledTwice).true;
        });

        it('invoked with original context', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {click: spy}));
            this.fire(div, 'click');
            expect(spy.lastCall.thisValue).equals(div);
        });

        it('provided with original Event argument', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {click: spy}));
            this.fire(div, 'click');
            expect(spy.args[0][0]).equals(this.e);
        });

        it('removes previous handlers', function() {
            const div = this.div();
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();
            this.handler(apply(div, {click: spy1}));
            this.handler(apply(div, {click: spy2}));
            this.fire(div, 'click');
            expect(spy1.calledOnce).false;
            expect(spy2.calledOnce).true;
        });

        it('removes handler when node removed', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {click: spy}));
            this.handler({
                type: 'engine:targets-removed',
                payload: [div]
            })
            this.fire(div, 'click');
            expect(spy.called).false;
        });

        ['keydown', 'keypress', 'keyup'].forEach(function testKeyboardEvent(type) {

            describe('KeyboardEvent: ' + type, function() {

                it('handles no key value', function() {
                    const div = this.div();
                    const spy = sinon.spy();
                    this.handler(apply(div, {[type]: spy}));
                    this.fire(div, type, null, {key: 'LeftArrow'}, this.window.KeyboardEvent);
                    expect(spy.called).true;
                });

                it('works with single key', function() {
                    const div = this.div();
                    const spy = sinon.spy();
                    this.handler(apply(div, {[type + '.leftarrow']: spy}));
                    this.fire(div, type, null, {key: 'LeftArrow'}, this.window.KeyboardEvent);
                    expect(spy.called).true;
                });

                it('works with multiple keys', function() {
                    const div = this.div();
                    const spy = sinon.spy();
                    this.handler(apply(div, {[type + '.rightarrow.leftarrow']: spy}));
                    this.fire(div, type, null, {key: 'LeftArrow'}, this.window.KeyboardEvent);
                    expect(spy.called).true;
                });

                it('does not handle non-matching keys', function() {
                    const div = this.div();
                    const spy = sinon.spy();
                    this.handler(apply(div, {[type + '.rightarrow']: spy}));
                    this.fire(div, type, null, {key: 'LeftArrow'}, this.window.KeyboardEvent);
                    expect(spy.called).false;
                });

                it('works with delegated events', function() {
                    const parent = this.div();
                    const child = this.div();
                    const spy = sinon.spy();
                    child.setAttribute('test', '');
                    parent.appendChild(child);
                    this.handler(apply(parent, {[type + '.leftarrow [test]']: spy}));
                    this.fire(child, type, null, {key: 'LeftArrow', bubbles: true}, this.window.KeyboardEvent);
                    expect(spy.called).true;
                });

                it('works with space key', function() {
                    const div = this.div();
                    const spy = sinon.spy();
                    this.handler(apply(div, {[type + '.space']: spy}));
                    this.fire(div, type, null, {key: ' '}, this.window.KeyboardEvent);
                    expect(spy.called).true;
                });

            });

        });

        ['mousedown', 'mouseup'].forEach(function testKeyboardEvent(type) {

            describe('MouseEvent: ' + type, function() {

                it('handles no key value', function() {
                    const div = this.div();
                    const spy = sinon.spy();
                    this.handler(apply(div, {[type]: spy}));
                    this.fire(div, type, null, {button: 0}, this.window.MouseEvent);
                    expect(spy.called).true;
                });

                it('works with single key', function() {
                    const div = this.div();
                    const spy = sinon.spy();
                    this.handler(apply(div, {[type + '.left']: spy}));
                    this.fire(div, type, null, {button: 0}, this.window.MouseEvent);
                    expect(spy.called).true;
                });

                it('works with multiple keys', function() {
                    const div = this.div();
                    const spy = sinon.spy();
                    this.handler(apply(div, {[type + '.right.left']: spy}));
                    this.fire(div, type, null, {button: 0}, this.window.MouseEvent);
                    expect(spy.called).true;
                });

                it('does not handle non-matching keys', function() {
                    const div = this.div();
                    const spy = sinon.spy();
                    this.handler(apply(div, {[type + '.right']: spy}));
                    this.fire(div, type, null, {button: 0}, this.window.MouseEvent);
                    expect(spy.called).false;
                });

                it('works with delegated events', function() {
                    const parent = this.div();
                    const child = this.div();
                    const spy = sinon.spy();
                    child.setAttribute('test', '');
                    parent.appendChild(child);
                    this.handler(apply(parent, {[type + '.left [test]']: spy}));
                    this.fire(child, type, null, {button: 0, bubbles: true}, this.window.MouseEvent);
                    expect(spy.called).true;
                });

            });

        });

    });

    describe('CustomEvent.dispatch', function() {

        it('exists', function() {
            const div = this.div();
            const dispatcher = (e) =>
                expect(e.dispatch).is.a('function');
            this.handler(apply(div, {click: dispatcher}));
            this.fire(div, 'click');
        });

        it('passed to handler for action type', function() {
            const div = this.div();
            const action = {type: 'test'};
            const dispatcher = (e) => e.dispatch(action);
            const receiver = (e) => expect(e.detail).exist;
            this.handler(apply(div, {click: dispatcher}, {test: receiver}));
            this.fire(div, 'click');
        });

        it('not passed to non-matching handlers', function() {
            const div = this.div();
            const action = {type: 'test'};
            const dispatcher = (e) => e.dispatch(action);
            const receiver = () => expect.fail();
            this.handler(apply(div, {click: dispatcher}, {custom: receiver}));
            this.fire(div, 'click');
        });

        it('handler provided action as `details`', function() {
            const div = this.div();
            const action = {type: 'test'};
            const dispatcher = (e) => e.dispatch(action);
            const receiver = (e) => expect(e.detail).equals(action);
            this.handler(apply(div, {click: dispatcher}, {test: receiver}));
            this.fire(div, 'click');
        });

        it('proxies bubbled event to Amara', function() {
            const div = this.div();
            const target = this.div();
            const action = {type: 'test'};
            const dispatcher = (e) => e.dispatch(action);
            target.appendChild(div);
            this.handler({
                type: 'core:bootstrap',
                payload: {target}
            })
            this.handler(apply(div, {click: dispatcher}));
            this.fire(div, 'click');
            expect(this.dispatch.calledWith(action)).true;
        });

        it('does not proxy stopped events to Amara', function() {
            const div = this.div();
            const target = this.div();
            const action = {type: 'test'};
            const dispatcher = (e) => e.dispatch(action);
            const receiver = (e) => e.stopPropagation();
            target.appendChild(div);
            this.handler({
                type: 'core:bootstrap',
                payload: {target}
            })
            this.handler(apply(div, {click: dispatcher}, {test: receiver}));
            this.fire(div, 'click');
            expect(this.dispatch.called).false;
        });

        it('throws error if invoked asynchronously', function(done) {
            const div = this.div();
            const action = {type: 'test'};
            const dispatcher = (e) => {
                const stub = sinon.spy(e, 'dispatch');
                setTimeout(() => {
                    try {
                        e.dispatch(action);
                    } finally {
                        expect(stub.threw()).true;
                        done();
                    }
                });
            };
            this.handler(apply(div, {click: dispatcher}));
            this.fire(div, 'click');
        });

    });

    describe('amara:add', function() {

        it('throws if selector provided', function() {
            expect(() => {
                this.handler(apply(this.div(), {'amara:add div': () => {}}));
            }).to.throw('amara:* events must not be delegated');
        });

        it('runs when target first applied', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {'amara:add': spy}));
            expect(spy.calledOnce).true;
        });

        it('runs multiple handlers', function() {
            const div = this.div();
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();
            this.handler(apply(div, {'amara:add': spy1}, {'amara:add': spy2}));
            expect(spy1.calledOnce).true;
            expect(spy2.calledOnce).true;
        });

        it('does not run when target re-applied', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {'amara:add': spy}));
            this.handler(apply(div, {'amara:add': spy}));
            expect(spy.calledOnce).true;
        });

        it('does not bubble', function() {
            const spy = sinon.spy();
            const parent = this.div();
            const child = this.div();
            parent.appendChild(child);
            this.handler(apply(parent, {'amara:add': spy}));
            spy.reset();
            this.handler(apply(child, {'click': () => {}}));
            expect(spy.called).false;
        });

        it('does not run when target removed', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {'amara:add': spy}));
            spy.reset();
            this.handler({
                type: 'engine:targets-removed',
                payload: [div]
            });
            expect(spy.called).false;
        });

    });

    describe('amara:apply', function() {

        it('throws if selector provided', function() {
            expect(() => {
                this.handler(apply(this.div(), {'amara:apply div': () => {}}));
            }).to.throw('amara:* events must not be delegated');
        });

        it('runs when target first applied', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {'amara:apply': spy}));
            expect(spy.calledOnce).true;
        });

        it('runs when target re-applied', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {'amara:apply': spy}));
            this.handler(apply(div, {'amara:apply': spy}));
            expect(spy.calledTwice).true;
        });

        it('runs multiple handlers', function() {
            const div = this.div();
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();
            this.handler(apply(div, {'amara:apply': spy1}, {'amara:apply': spy2}));
            expect(spy1.calledOnce).true;
            expect(spy2.calledOnce).true;
        });

        it('does not bubble', function() {
            const spy = sinon.spy();
            const parent = this.div();
            const child = this.div();
            parent.appendChild(child);
            this.handler(apply(parent, {'amara:apply': spy}));
            spy.reset();
            this.handler(apply(child, {'click': () => {}}));
            expect(spy.called).false;
        });

        it('does not run when target removed', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {'amara:apply': spy}));
            spy.reset();
            this.handler({
                type: 'engine:targets-removed',
                payload: [div]
            });
            expect(spy.called).false;
        });

    });

    describe('amara:remove', function() {

        it('throws if selector provided', function() {
            expect(() => {
                this.handler(apply(this.div(), {'amara:remove div': () => {}}));
            }).to.throw('amara:* events must not be delegated');
        });

        it('does not run when target first applied', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {'amara:remove': spy}));
            expect(spy.called).false;
        });

        it('does not run when target re-applied', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {'amara:remove': spy}));
            this.handler(apply(div, {'amara:remove': spy}));
            expect(spy.called).false;
        });

        it('runs when target removed', function() {
            const div = this.div();
            const spy = sinon.spy();
            this.handler(apply(div, {'amara:remove': spy}));
            this.handler({
                type: 'engine:targets-removed',
                payload: [div]
            });
            expect(spy.calledOnce).true;
        });

        it('runs multiple handlers', function() {
            const div = this.div();
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();
            this.handler(apply(div, {'amara:remove': spy1}, {'amara:remove': spy2}));
            this.handler({
                type: 'engine:targets-removed',
                payload: [div]
            });
            expect(spy1.calledOnce).true;
            expect(spy2.calledOnce).true;
        });

        it('does not bubble', function() {
            const spy = sinon.spy();
            const parent = this.div();
            const child = this.div();
            parent.appendChild(child);
            this.handler(apply(parent, {'amara:remove': spy}));
            spy.reset();
            this.handler(apply(child, {'click': () => {}}));
            expect(spy.called).false;
        });

    });

});
