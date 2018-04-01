// @flow

const rxEventAndSelectors = /(^[^\s]+)\s*?(.*?)$/;

const metaEventMap = {
    keydown:    'key',
    keyup:      'key',
    keypress:   'key',
    mousedown:  'button',
    mouseup:    'button'
};

const trim = (s) => s.trim();
const trimLower = (s) => s.trim().toLowerCase();

function matches(selector) {
    return this.matches(selector);
}

function asMeta(value) {
    switch (value) {
        case 'space':   return ' ';
        case 'left':    return '0';
        case 'middle':  return '1';
        case 'wheel':   return '1';
        case 'right':   return '2';
        default:        return value;
    }
}

// browser cross-compatibility
function fixMeta(value) {
    switch (value) {
        case 'del':     return 'delete';
        default:        return value;
    }
}

function removeListener(handler) {
    this.target.removeEventListener(this.type, handler);
}

function removeListeners(handlers, type) {
    handlers.forEach(removeListener, {target: this, type});
}

function throwError(message) {
    throw new Error(message);
}

export default function AmaraPluginEvents(): AmaraEvents {

    return function createHandler(dispatch: Dispatch) {

        let root = null,
            async = true;

        const targetHandlers: WeakMap<Node, WrapperMap> = new WeakMap();

        function proxyToAmara(e) {
            !e.type.startsWith('amara:') && dispatch(e.detail);
        }

        function syncDispatch(dispatcher, action) {
            async = false;
            dispatcher(action, {});
            async = true;
        }

        // firefox and IE don't dispatch events from disabled
        // form elements; we temporarily remove the element's
        // disabled attribute but watch for changes so we can
        // set the attribute correctly when the event completes

        function prePatchDisabledBug(target, meta) {
            meta.orig = {
                setAttribute: target.setAttribute,
                removeAttribute: target.removeAttribute
            };
            meta.disabled = target.hasAttribute('disabled');
            target.removeAttribute('disabled');
            target.setAttribute = (attr, value) => {
                if (attr !== 'disabled') {
                    return meta.orig.setAttribute.call(target, attr, value);
                }
                meta.disabled = true;
            };
            target.removeAttribute = (attr) => {
                if (attr !== 'disabled') {
                    return meta.orig.removeAttribute.call(target, attr);
                }
                meta.disabled = false;
            };
        }

        function postPatchDisabledBug(target, meta) {
            target.setAttribute = meta.orig.setAttribute;
            target.removeAttribute = meta.orig.removeAttribute;
            meta.disabled ? target.setAttribute('disabled', '') : target.removeAttribute('disabled');
        }

        function getTargetDispatcher(target) {
            return function dispatchActionAsEvent(action: Action, eventInitOptions = {
                bubbles: true,
                cancelable: true,
                composed: true
            }) {
                if (async) throwError('Event actions must be dispatched synchronously.');
                eventInitOptions.detail = action;
                const meta = {};
                const ce = new window.CustomEvent(action.type, eventInitOptions);
                root && root.addEventListener(action.type, proxyToAmara);
                prePatchDisabledBug(target, meta);
                let result = target.dispatchEvent(ce);
                postPatchDisabledBug(target, meta);
                root && root.removeEventListener(action.type, proxyToAmara);
                return result;
            };
        }

        function addHandlerForEvent(eventAndSelectors) {
            let arrHandlers: EventHandler[],
                mapEventHandlers: void|Map<string, EventHandler[]>;
            const { map, target, dispatcher } = this;
            const [ eventMeta: String, selectors: String = '' ] =
                (rxEventAndSelectors.exec(eventAndSelectors) || []).slice(1);
            const handler: EventHandler = map[eventAndSelectors];
            const delegates: String[] = selectors
                .split(',')
                .map(trim)
                .filter(Boolean);
            const [event, ...meta] = eventMeta
                .split('.')
                .map(trimLower)
                .map(asMeta);
            function eventHandler(e: Event) {
                let result, metaValue = fixMeta(String(e[metaEventMap[e.type]]).toLowerCase());
                if (delegates.length && !delegates.some(matches, e.target)) {
                    return;
                }
                if (meta.length && !meta.includes(String(metaValue).toLowerCase())) {
                    return;
                }
                async = false;
                e.dispatch = dispatcher;
                result = handler.call(this, e);
                async = true;
                return result;
            }
            if (event.startsWith('amara:') && delegates.length) {
                throwError('amara:* events must not be delegated');
            }
            mapEventHandlers = targetHandlers.get(target);
            if (!mapEventHandlers) {
                this.added = true;
                targetHandlers.set(target, mapEventHandlers = new Map());
            }
            arrHandlers = mapEventHandlers.get(event);
            arrHandlers || mapEventHandlers.set(event, arrHandlers = []);
            target.addEventListener(event, eventHandler);
            arrHandlers.push(eventHandler);
        }

        function applyEventMap(map: EventMap) {
            this.map = map;
            Object.keys(map).forEach(addHandlerForEvent, this);
        }

        function applyEventsToTarget(results: EventMap[], target: Node) {
            const context = {
                target,
                added: false,
                dispatcher: getTargetDispatcher(target)
            };
            const mapEventHandlers = targetHandlers.get(target);
            mapEventHandlers && mapEventHandlers.forEach(removeListeners, target);
            mapEventHandlers && mapEventHandlers.clear();
            [].concat(...results).forEach(applyEventMap, context);
            context.added && syncDispatch(context.dispatcher, {type: 'amara:add'});
            syncDispatch(context.dispatcher, {type: 'amara:apply'});
        }

        function removeTargetHandlers(target: Node) {
            const mapHandlerWrapper: void|Map<string, EventHandler[]> = targetHandlers.get(target);
            if (mapHandlerWrapper) {
                syncDispatch(getTargetDispatcher(target), {type: 'amara:remove'});
                targetHandlers.delete(target);
                mapHandlerWrapper.forEach(removeListeners, target);
                mapHandlerWrapper.clear();
            }
        }

        return function handler(action) {
            switch(action.type) {
            case 'core:bootstrap':
                root = action.payload.target;
                break;
            case 'core:apply-target-results':
                action.payload.events && action.payload.events.forEach(applyEventsToTarget);
                break;
            case 'engine:targets-removed':
                action.payload.forEach(removeTargetHandlers);
            }
        };

    };

}

type Action = {
    type: string,
    meta?: {},
    payload: any
}

type Dispatch = (action: Action) => void;

type AmaraEvents = (dispatch: Dispatch) => (action: Action) => void;

type EventHandler = (e?: Event) => ?boolean

type EventMap = {
    [name: string]: EventHandler
}

type WrapperMap = Map<string, EventHandler[]>
