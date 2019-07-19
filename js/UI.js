
var Slider = function (element, min, max, initialValue, changeCallback) {
    var div = element;

    var innerDiv = document.createElement('div');
    innerDiv.style.position = 'absolute';
    innerDiv.style.height = div.offsetHeight + 'px';

    div.appendChild(innerDiv);

    var color = 'black';

    var value = initialValue;

    this.setColor = function (newColor) {
        color = newColor;
        redraw();
    };

    this.getValue = function () {
        return value;
    };

    var mousePressed = false;

    var redraw = function () {
        var fraction = (value - min) / (max - min);
        innerDiv.style.background = color;
        innerDiv.style.width = fraction * div.offsetWidth + 'px';
        innerDiv.style.height = div.offsetHeight + 'px';
    };

    redraw();

    div.addEventListener('mousedown', function (event) {
        mousePressed = true;
        onChange(event);
    });

    document.addEventListener('mouseup', function (event) {
        mousePressed = false;
    });

    document.addEventListener('mousemove', function (event) {
        if (mousePressed) {
            onChange(event);
        }
    });

    var onChange = function (event) {
        var mouseX = getMousePosition(event, div).x;

        value = clamp((mouseX / div.offsetWidth) * (max - min) + min, min, max);

        changeCallback(value);

        redraw();
    };
};

var Buttons = function (elements, changeCallback) {
    var activeElement = elements[0];

    var color;

    this.setColor = function (newColor) {
        color = newColor;
        refresh();
    };

    var refresh = function () {
        for (var i = 0; i < elements.length; ++i) {
            if (elements[i] === activeElement) {
                elements[i].style.color = BUTTON_ACTIVE_COLOR;
                elements[i].style.background = color;
            } else {
                elements[i].style.color = BUTTON_COLOR;
                elements[i].style.background = BUTTON_BACKGROUND;
            }
        }
    };

    for (var i = 0; i < elements.length; ++i) {
        (function () { //create closure to store index
            var index = i;
            var clickedElement = elements[i];
            elements[i].addEventListener('click', function () {
                if (activeElement !== clickedElement) {
                    activeElement = clickedElement;

                    changeCallback(index);

                    refresh();
                }

            });
        }());
    }
};
