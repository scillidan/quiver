"use strict";

/// A helper method to trigger later in the event queue.
function delay(f, duration = 0) {
    setTimeout(f, duration);
}

// Older versions of Safari are problematic because they're essentially tied to the macOS version,
// and may not have support for pointer events. In this case, we simply replace them with mouse
// events instead.
// This should behave acceptably, because we don't access many pointer-specific properties in the
// pointer events, and for those that we do, `undefined` will behave as expected.
function pointer_event(name) {
    if (`onpointer${name}` in document.documentElement) {
        return `pointer${name}`;
    } else {
        return `mouse${name}`;
    }
}

/// A helper object for dealing with the DOM.
const DOM = {};

/// A class for conveniently dealing with elements. It's primarily useful in giving us a way to
/// create an element and immediately set properties and styles, in a single statement.
DOM.Element = class {
    /// `from` has two forms: a plain string, in which case it is used as a `tagName` for a new
    /// element, or an existing element, in which case it is wrapped in a `DOM.Element`.
    constructor(from, attributes = {}, style = {}, namespace = null) {
        if (typeof from !== "string") {
            this.element = from;
        } else if (namespace !== null) {
            this.element = document.createElementNS(namespace, from);
        } else {
            this.element = document.createElement(from);
        }
        this.set_attributes(attributes);
        this.set_style(style);
    }

    get id() {
        return this.element.id;
    }

    get class_list() {
        return this.element.classList;
    }

    get parent() {
        return new DOM.Element(this.element.parentElement);
    }

    /// Appends an element.
    /// `value` has three forms: a plain string, in which case it is added as a text node; a
    /// `DOM.Element`, in which case the corresponding element is appended; or a plain element.
    add(value) {
        if (value instanceof DOM.Element) {
            this.element.appendChild(value.element);
        } else if (typeof value !== "string") {
            this.element.appendChild(value);
        } else {
            this.element.appendChild(document.createTextNode(value));
        }
        return this;
    }

    /// Appends this element to the given one.
    add_to(value) {
        if (value instanceof DOM.Element) {
            value.element.appendChild(this.element);
        } else {
            value.appendChild(this.element);
        }
        return this;
    }

    /// Removes the element from the DOM.
    remove() {
        this.element.remove();
    }

    /// Adds an event listener.
    listen(type, f) {
        this.element.addEventListener(type, event => f(event, this.element));
        return this;
    }

    /// Removes all children from the element.
    clear() {
        while (this.element.firstChild !== null) {
            this.element.firstChild.remove();
        }
        return this;
    }

    /// Shorthand for `clear().add(...)`.
    replace(value) {
        return this.clear().add(value);
    }

    query_selector(selector) {
        const element = this.element.querySelector(selector);
        if (element !== null) {
            return new DOM.Element(element);
        } else {
            return null;
        }
    }

    query_selector_all(selector) {
        const elements = Array.from(this.element.querySelectorAll(selector));
        return elements.map((element) => new DOM.Element(element));
    }

    get_attribute(attribute) {
        return this.element.getAttribute(attribute);
    }

    set_attributes(attributes = {}) {
        for (const [attribute, value] of Object.entries(attributes)) {
            if (value !== null) {
                this.element.setAttribute(attribute, value);
            } else {
                this.element.removeAttribute(attribute);
            }
        }
        return this;
    }

    remove_attributes(...attributes) {
        for (const attribute of attributes) {
            this.element.removeAttribute(attribute);
        }
        return this;
    }

    set_style(style = {}) {
        Object.assign(this.element.style, style);
    }

    clone() {
        return new DOM.Element(this.element.cloneNode());
    }

    bounding_rect() {
        return this.element.getBoundingClientRect();
    }

    dispatch(event) {
        this.element.dispatchEvent(event);
        return this;
    }
};

/// A class for conveniently dealing with SVGs.
DOM.SVGElement = class extends DOM.Element {
    constructor(tag_name, attributes = {}, style = {}) {
        super(tag_name, attributes, style, DOM.SVGElement.NAMESPACE);
    }
};
DOM.SVGElement.NAMESPACE = "http://www.w3.org/2000/svg";

/// A class for conveniently dealing with canvases.
DOM.Canvas = class extends DOM.Element {
    constructor(from, width, height, attributes = {}, style = {}) {
        super(from || "canvas", attributes, style);
        this.context = this.element.getContext("2d");
        if (from === null) {
            this.resize(width, height);
        }
        this.context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    }

    /// Resizes and clears the canvas.
    resize(width, height) {
        const dpr = window.devicePixelRatio;
        // Only resize the canvas when necessary.
        if (width * dpr !== this.element.width || height * dpr != this.element.height) {
            this.element.width = width * dpr;
            this.element.height = height * dpr;
            this.element.style.width = `${width}px`;
            this.element.style.height = `${height}px`;
            this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
        } else {
            this.context.clearRect(0, 0, width, height);
        }
    }
}

/// A class for conveniently dealing with tables.
DOM.Table = class extends DOM.Element {
    constructor(rows, attributes = {}, style = {}) {
        super("table", attributes, style);

        for (const row of rows) {
            const tr = new DOM.Element("tr").add_to(this);
            for (const value of row) {
                const td = new DOM.Element("td").add_to(tr);
                if (typeof value === "function") {
                    value(td);
                } else {
                    td.add(value);
                }
            }
        }
    }
};

/// A class for conveniently dealing with lists.
DOM.List = class extends DOM.Element {
    constructor(ordered = true, items, attributes = {}, style = {}) {
        super(ordered ? "ol" : "ul", attributes, style);

        for (let item of items) {
            // Wrap in `<li>` if necessary.
            if (!(item instanceof DOM.Element) || item.element.className !== "li") {
                item = new DOM.Element("li").add(item);
            }
            this.add(item);
        }
    }
};

// A class for conveniently dealing with hyperlinks.
DOM.Link = class extends DOM.Element {
    constructor(url, content, new_tab = false, attributes = {}, style = {}) {
        super("a", Object.assign({ href: url }, attributes), style);
        if (new_tab) {
            this.set_attributes({ target: "_blank" });
        }
        this.add(content);
    }
};

// A custom `input[type="range"]` that permits multiple thumbs.
DOM.Multislider = class extends DOM.Element {
    constructor(name, min, max, step = 1, attributes = {}, style = {}) {
        // The slider element, containing the track and thumbs.
        super("div", attributes, style);
        this.class_list.add("slider");

        this.min = min;
        this.max = max;
        this.step = step;

        // The track, in which the thumbs are placed.
        const track = new DOM.Element("div", { class: "track" }).add_to(this);

        // The thumbs, which may be dragged by the user.
        this.thumbs = [new DOM.Multislider.Thumb(this, this.min)];

        if (this.thumbs.length > 0) {
            track.listen(pointer_event("move"), (event) => {
                if (DOM.Multislider.active_thumb === null) {
                    // Find the closest thumb to the cursor.
                    const thumb_proximities = this.thumbs.map((thumb) => {
                        // Functional programmers, please avert your eyes.
                        thumb.class_list.remove("hover");

                        const thumb_rect = thumb.bounding_rect();
                        return [event.clientX - thumb_rect.left + thumb_rect.width / 2, thumb];
                    });
                    thumb_proximities.sort(([prox1,], [prox2,]) => prox1 - prox2);
                    // We're "hovering" over the closest thumb.
                    const [, closest_thumb] = thumb_proximities[0];
                    closest_thumb.class_list.add("hover");
                }
            });

            track.listen(pointer_event("down"), (event) => {
                const hovered_thumb = this.thumbs.find((thumb) => {
                    return thumb.class_list.contains("hover");
                });
                if (!this.class_list.contains("disabled") && typeof hovered_thumb !== "undefined") {
                    // Display the currently-dragged thumb above any other. This is important where
                    // there are multiple thumbs, which can overlap.
                    this.thumbs.forEach((thumb) => thumb.set_style({ "z-index": 1 }));
                    hovered_thumb.class_list.add("active");
                    hovered_thumb.move_to_pointer(event);
                    DOM.Multislider.active_thumb = hovered_thumb;
                    hovered_thumb.set_style({ "z-index": 2 });
                }
            });

            track.listen(pointer_event("leave"), () => {
                this.query_selector_all(".thumb.hover").forEach((thumb) => {
                    thumb.class_list.remove("hover");
                });
            });
        }

        // The label containing both the slider, and the slider value.
        this.label = new DOM.Element("label")
            .add(`${name}: `)
            .add(this)
            .add(new DOM.Element("span", { class: "slider-value" }));
    }
};

// A draggable thumb on a slider.
DOM.Multislider.Thumb = class extends DOM.Element {
    constructor(slider, attributes = {}, style = {}) {
        super("div", Object.assign({
            class: `thumb ${(attributes.class || "")}`.trim(),
        }, attributes), style);
        this.slider = slider.add(this);
        // We don't want to update the `value` until the slider has been added to the DOM, so we can
        // query element sizes. For this reason, we set `value` to `null` to begin with, and rely on
        // the caller to `set_value` manually.
        this.value = null;
    }

    /// Move the thumb to the location of the pointer `event`.
    move_to_pointer(event) {
        const slider_rect = this.slider.bounding_rect();
        const thumb_width = this.bounding_rect().width;
        const x = clamp(
            thumb_width / 2,
            event.clientX - slider_rect.left,
            slider_rect.width - thumb_width / 2,
        );
        const value = this.slider.min + Math.round(
            (x - thumb_width / 2) / (slider_rect.width - thumb_width)
                * (this.slider.max - this.slider.min) / this.slider.step
        ) * this.slider.step;
        this.set_value(value, true);
    }

    /// We use a setter, which allows us to update the position of the thumb as well as the value of
    /// `this.value`.
    /// Returns whether the thumb value was changed (i.e. whether the given `value` was valid and
    // different to the current value).
    set_value(value, user_triggered = false) {
        value = clamp(this.slider.min, value, this.slider.max);

        if (value !== this.value) {
            this.value = value;

            // Trigger a `input` event on the slider.
            if (user_triggered) {
                this.slider.dispatch(new Event("input"));
            }

            const slider_rect = this.slider.bounding_rect();
            const thumb_rect = this.bounding_rect();
            this.set_style({
                left: `${
                    thumb_rect.width / 2
                        + (value - this.slider.min) / (this.slider.max - this.slider.min)
                            * (slider_rect.width - thumb_rect.width)
                }px`,
            });
            if (this.slider.thumbs.length === 1) {
                this.slider.label.query_selector(".slider-value").replace(`${this.value}`);
            }

            return true;
        }

        return false;
    }
}

// The `DOM.Multislider.Thumb` currently being dragged, or `null` if none is.
DOM.Multislider.active_thumb = null;

// Handle dragging slider thumbs.
window.addEventListener(pointer_event("move"), (event) => {
    if (DOM.Multislider.active_thumb !== null) {
        DOM.Multislider.active_thumb.move_to_pointer(event);
    }
});

// Handle the release of slider thumbs.
window.addEventListener(pointer_event("up"), () => {
    if (DOM.Multislider.active_thumb !== null) {
        DOM.Multislider.active_thumb.class_list.remove("active");
        DOM.Multislider.active_thumb = null;
    }
});
