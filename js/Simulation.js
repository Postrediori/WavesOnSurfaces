'use strict'

var QUAD_VERTEX_SOURCE = [
    'precision highp float;',
    
    'attribute vec3 a_position;',
    'attribute vec3 a_texCoord;',

    'uniform mat4 u_projection;',
    'uniform mat4 u_view;',

    'void main (void) {',
        'vec3 position = a_position;',
        'gl_Position = u_projection * u_view * vec4(a_position, 1.0);',
    '}',
].join('\n');

var QUAD_FRAGMENT_SOURCE = [
    'precision highp float;',

    'uniform vec3 u_color;',

    'void main (void) {',
        'gl_FragColor = vec4(u_color, 1.0);',
    '}',
].join('\n');

var BaseModel = function() {
    this.waveAmplitude = INITIAL_AMPLITUDE;
    this.waveVelocity = INITIAL_VELOCITY;
    this.wavePeriod = 1.0 / INITIAL_PERIOD;
    this.waveDissipation = INITIAL_DISSIPATION;
        
    this.setVelocity = function (newVelocity) {
        this.waveVelocity = newVelocity;
    };

    this.setPeriod = function (newPeriod) {
        this.wavePeriod = 1.0 / newPeriod;
    };

    this.setDissipation = function (newDissipation) {
        this.waveDissipation = newDissipation;
    };
    
    this.getDisplacement = function(outDisplacement, coord, t) {
        outDisplacement[X_INDEX] = 0.0;
        outDisplacement[Y_INDEX] = 0.0;
        outDisplacement[Z_INDEX] = 0.0;
        outDisplacement[W_INDEX] = 0.0;

        return outDisplacement;
    }
};

var RayleighWaveModel = function() {
    BaseModel.call(this);
    
    // Mechanical parameters
    var E = 1.0; // Imaginary material
    var rho = 10.0; // Imaginary material
    var nu = 0.3; // Let's stick to classics
    
    // Lame' parameters
    var lambda = nu * E / ((1 + nu) * (1 - 2 * nu));
    var mu = E / (2 * (1 + nu));
    
    // Approx. solution of Rayleigh wave
    var thetaR = (0.87 + 1.12 * nu) / (1 + nu);
    
    this.getDisplacement = function(outDisplacement, coord0, t) {
        var scale = this.wavePeriod / 5.0;
        var omega = 2.5;
        var A = this.waveAmplitude * scale;
        
        var coord = [
            coord0[X_INDEX] * scale,
            coord0[Y_INDEX] * scale,
            coord0[Z_INDEX] * scale * 0.25,
            coord0[W_INDEX] * scale
        ];
        
        // Depth of a point
        var depth = GEOMETRY_SIZE / 2.0 * scale - coord[Y_INDEX];
        var delta = depth / GEOMETRY_SIZE * this.waveDissipation * 2.;
        
        // Rayleigh wave numbers for longitudinal and transversal waves
        var cL = omega * Math.sqrt(rho / (lambda  + 2 * mu));
        var cT = omega * Math.sqrt(rho / mu);
        
        // Rayleigh wave velocity
        var c = cT / Math.sqrt(thetaR);
        
        var qR = Math.sqrt(c * c - cL * cL);
        var sR = Math.sqrt(c * c - cT * cT);
        
        var amplitude = [
            0.0,
            A * c,
            A * qR
        ];
        
        var dissipation = [
            0.0,
            Math.exp(-qR * delta) - 2 * qR * sR / (cT * cT) * Math.exp(-sR * delta),
            Math.exp(-qR * delta) - 2 * c * c / (2 * c * c - cT * cT) * Math.exp(-sR * delta)
        ];
        
        var phi = c * coord[Z_INDEX] - omega * t * this.waveVelocity;
        
        outDisplacement[X_INDEX] = 0.0;
        outDisplacement[Y_INDEX] = amplitude[Y_INDEX] * dissipation[Y_INDEX] * Math.cos(phi - Math.PI / 2.0);
        outDisplacement[Z_INDEX] = amplitude[Z_INDEX] * dissipation[Z_INDEX] * Math.cos(phi);
        outDisplacement[W_INDEX] = 0.0;

        return outDisplacement;
    }
};

var LoveWaveModel = function() {
    BaseModel.call(this);
    
    this.getDisplacement = function(outDisplacement, coord, t) {
        var depth = GEOMETRY_SIZE / 2.0 - coord[Y_INDEX];
        var delta = depth / GEOMETRY_SIZE;

        outDisplacement[X_INDEX] = this.waveAmplitude * Math.exp(-this.waveDissipation * delta) *
            Math.cos(this.wavePeriod * coord[Z_INDEX] - this.waveVelocity * t);
        outDisplacement[Y_INDEX] = 0.0;
        outDisplacement[Z_INDEX] = 0.0;
        outDisplacement[W_INDEX] = 0.0;

        return outDisplacement;
    }
};

var Simulator = function(canvas, width, height) {
    var canvas = canvas;
    canvas.width = width;
    canvas.height = height;
    
    var loveWaveModel = new LoveWaveModel();
    var rayleighWaveModel = new RayleighWaveModel();
    var waveModels = [loveWaveModel, rayleighWaveModel];
    
    this.waveModel = loveWaveModel;

    var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    var currentTime = 0.0;

    gl.clearColor.apply(gl, CLEAR_COLOR);
    gl.enable(gl.DEPTH_TEST);

    var quadProgram = gl.createProgram();
    var quadProgram = buildProgramWrapper(gl,
        buildShader(gl, gl.VERTEX_SHADER, QUAD_VERTEX_SOURCE),
        buildShader(gl, gl.FRAGMENT_SHADER, QUAD_FRAGMENT_SOURCE),
        {"a_position" : 0});

    var quadColor = new Float32Array([0.9, 0.9, 0.9]);
    var outlineColor = new Float32Array([0.1, 0.1, 0.1]);
    
    gl.enableVertexAttribArray(0);

    // Top
    var cubeDataTop = [];
    for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION * 5; zIndex += 1) {
        for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION; xIndex += 1) {
            cubeDataTop.push((xIndex * GEOMETRY_SIZE) / (GEOMETRY_RESOLUTION - 1) + GEOMETRY_ORIGIN[0]);
            cubeDataTop.push(GEOMETRY_ORIGIN[1] + GEOMETRY_SIZE);
            cubeDataTop.push((zIndex * GEOMETRY_SIZE * 5.0) / (GEOMETRY_RESOLUTION * 5 - 1) + GEOMETRY_ORIGIN[2]);
            cubeDataTop.push((0.0));
        }
    }
    
    // Left
    var cubeDataLeft = [];
    for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION * 5; zIndex += 1) {
        for (var yIndex = 0; yIndex < GEOMETRY_RESOLUTION; yIndex += 1) {
            cubeDataLeft.push(GEOMETRY_ORIGIN[0]);
            cubeDataLeft.push((yIndex * GEOMETRY_SIZE) / (GEOMETRY_RESOLUTION - 1) + GEOMETRY_ORIGIN[1]);
            cubeDataLeft.push((zIndex * GEOMETRY_SIZE * 5.0) / (GEOMETRY_RESOLUTION * 5 - 1) + GEOMETRY_ORIGIN[2]);
            cubeDataLeft.push((0.0));
        }
    }

    // Left
    var cubeDataFront = [];
    for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION; xIndex += 1) {
        for (var yIndex = 0; yIndex < GEOMETRY_RESOLUTION; yIndex += 1) {
            cubeDataFront.push((xIndex * GEOMETRY_SIZE) / (GEOMETRY_RESOLUTION - 1) + GEOMETRY_ORIGIN[0]);
            cubeDataFront.push((yIndex * GEOMETRY_SIZE) / (GEOMETRY_RESOLUTION - 1) + GEOMETRY_ORIGIN[1]);
            cubeDataFront.push(GEOMETRY_SIZE * 5.0 + GEOMETRY_ORIGIN[2]);
            cubeDataFront.push((0.0));
        }
    }

    var cubeBufferTop = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferTop);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeDataTop), gl.DYNAMIC_DRAW);

    var cubeBufferLeft = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferLeft);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeDataLeft), gl.DYNAMIC_DRAW);

    var cubeBufferFront = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferFront);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeDataFront), gl.DYNAMIC_DRAW);

    // Top & left
    var cubeIndices = [];
    for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION * 5 - 1; zIndex += 1) {
        for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION - 1; xIndex += 1) {
            var topLeft = zIndex * GEOMETRY_RESOLUTION + xIndex,
                topRight = topLeft + 1,
                bottomLeft = topLeft + GEOMETRY_RESOLUTION,
                bottomRight = bottomLeft + 1;

            cubeIndices.push(topLeft);
            cubeIndices.push(bottomLeft);
            cubeIndices.push(bottomRight);
            cubeIndices.push(bottomRight);
            cubeIndices.push(topRight);
            cubeIndices.push(topLeft);
        }
    }

    // Front
    var cubeIndicesFront = [];
    for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION - 1; xIndex += 1) {
        for (var yIndex = 0; yIndex < GEOMETRY_RESOLUTION - 1; yIndex += 1) {
            var topLeft = xIndex * GEOMETRY_RESOLUTION + yIndex,
                topRight = topLeft + 1,
                bottomLeft = topLeft + GEOMETRY_RESOLUTION,
                bottomRight = bottomLeft + 1;

            cubeIndicesFront.push(topLeft);
            cubeIndicesFront.push(bottomLeft);
            cubeIndicesFront.push(bottomRight);
            cubeIndicesFront.push(bottomRight);
            cubeIndicesFront.push(topRight);
            cubeIndicesFront.push(topLeft);
        }
    }

    var cubeIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIndices), gl.STATIC_DRAW);

    var cubeIndexBufferFront = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBufferFront);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeIndicesFront), gl.STATIC_DRAW);

    // Top & left
    // X-lines
    var cubeOutlineIndices = [];
    for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION; xIndex += 1) {
        for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION * 5 - 1; zIndex += 1) {
            var topIndex = zIndex * GEOMETRY_RESOLUTION + xIndex,
                bottomIndex = topIndex + GEOMETRY_RESOLUTION;
            cubeOutlineIndices.push(topIndex);
            cubeOutlineIndices.push(bottomIndex);
        }
    }

    // Z-lines
    for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION * 5; zIndex += 1) {
        for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION - 1; xIndex += 1) {
            var leftIndex = zIndex * GEOMETRY_RESOLUTION + xIndex,
                rightIndex = leftIndex + 1;
            cubeOutlineIndices.push(leftIndex);
            cubeOutlineIndices.push(rightIndex);
        }
    }

    // Front
    var cubeOutlineIndicesFront = [];

    for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION; xIndex += 1) {
        for (var yIndex = 0; yIndex < GEOMETRY_RESOLUTION - 1; yIndex += 1) {
            var topIndex = yIndex * GEOMETRY_RESOLUTION + xIndex,
                bottomIndex = topIndex + GEOMETRY_RESOLUTION;
            cubeOutlineIndicesFront.push(topIndex);
            cubeOutlineIndicesFront.push(bottomIndex);
        }
    }

    for (var yIndex = 0; yIndex < GEOMETRY_RESOLUTION; yIndex += 1) {
        for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION - 1; xIndex += 1) {
            var leftIndex = yIndex * GEOMETRY_RESOLUTION + xIndex,
                rightIndex = leftIndex + 1;
            cubeOutlineIndicesFront.push(leftIndex);
            cubeOutlineIndicesFront.push(rightIndex);
        }
    }

    var cubeOutlineIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeOutlineIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeOutlineIndices), gl.STATIC_DRAW);

    var cubeOutlineIndexBufferFront = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeOutlineIndexBufferFront);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(cubeOutlineIndicesFront), gl.STATIC_DRAW);

    this.setVelocity = function (newVelocity) {
        for (var i = 0; i < waveModels.length; i++) {
            waveModels[i].setVelocity(newVelocity);
        }
    };

    this.setPeriod = function (newPeriod) {
        for (var i = 0; i < waveModels.length; i++) {
            waveModels[i].setPeriod(newPeriod);
        }
    };

    this.setDissipation = function (newDissipation) {
        for (var i = 0; i < waveModels.length; i++) {
            waveModels[i].setDissipation(newDissipation);
        }
    };
    
    this.setModel = function (newModel) {
        this.waveModel = waveModels[newModel];
    };

    this.resize = function (width, height) {
        canvas.width = width;
        canvas.height = height;
    };

    this.getCoord = function(outCoord, data, u, v) {
        var index = (u * GEOMETRY_RESOLUTION + v) * 4;

        outCoord[X_INDEX] = data[index+X_INDEX];
        outCoord[Y_INDEX] = data[index+Y_INDEX];
        outCoord[Z_INDEX] = data[index+Z_INDEX];
        outCoord[W_INDEX] = data[index+W_INDEX];

        return outCoord;
    }
    
    this.update = function(t) {
        var newCubeData = null;
        var coord = new Float32Array(4),
            outputCoord = new Float32Array(4),
            displacement = new Float32Array(4);

        // Top
        newCubeData = [];
        for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION * 5; zIndex += 1) {
            for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION; xIndex += 1) {
                this.getCoord(coord, cubeDataTop, zIndex, xIndex);
                this.waveModel.getDisplacement(displacement, coord, t);
                coordAdd(outputCoord, coord, displacement);

                newCubeData.push(outputCoord[X_INDEX]);
                newCubeData.push(outputCoord[Y_INDEX]);
                newCubeData.push(outputCoord[Z_INDEX]);
                newCubeData.push(outputCoord[W_INDEX]);

                gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferTop);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(newCubeData));
            }
        }
        
        // Left
        newCubeData = [];
        for (var zIndex = 0; zIndex < GEOMETRY_RESOLUTION * 5; zIndex += 1) {
            for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION; xIndex += 1) {
                this.getCoord(coord, cubeDataLeft, zIndex, xIndex);
                this.waveModel.getDisplacement(displacement, coord, t);
                coordAdd(outputCoord, coord, displacement);

                newCubeData.push(outputCoord[X_INDEX]);
                newCubeData.push(outputCoord[Y_INDEX]);
                newCubeData.push(outputCoord[Z_INDEX]);
                newCubeData.push(outputCoord[W_INDEX]);

                gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferLeft);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(newCubeData));
            }
        }

        // Front
        newCubeData = [];
        for (var xIndex = 0; xIndex < GEOMETRY_RESOLUTION; xIndex += 1) {
            for (var yIndex = 0; yIndex < GEOMETRY_RESOLUTION; yIndex += 1) {
                this.getCoord(coord, cubeDataFront, xIndex, yIndex);
                this.waveModel.getDisplacement(displacement, coord, t);
                coordAdd(outputCoord, coord, displacement);

                newCubeData.push(outputCoord[X_INDEX]);
                newCubeData.push(outputCoord[Y_INDEX]);
                newCubeData.push(outputCoord[Z_INDEX]);
                newCubeData.push(outputCoord[W_INDEX]);

                gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferFront);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(newCubeData));
            }
        }
    }

    this.render = function(deltaTime, projectionMatrix, viewMatrix) {
        currentTime += deltaTime;

        this.update(currentTime);

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(quadProgram.program);

        gl.uniformMatrix4fv(quadProgram.uniformLocations['u_projection'], false, projectionMatrix);
        gl.uniformMatrix4fv(quadProgram.uniformLocations['u_view'], false, viewMatrix);

        gl.uniform3fv(quadProgram.uniformLocations['u_color'], quadColor);

        // Draw Faces
        gl.polygonOffset(1, 0);
        gl.enable(gl.POLYGON_OFFSET_FILL);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIndexBuffer);

        // Top
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferTop);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4 * SIZE_OF_FLOAT, 0);
        gl.drawElements(gl.TRIANGLES, cubeIndices.length, gl.UNSIGNED_SHORT, 0);

        // Left
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferLeft);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4 * SIZE_OF_FLOAT, 0);
        gl.drawElements(gl.TRIANGLES, cubeIndices.length, gl.UNSIGNED_SHORT, 0);

        // Front
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferFront);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4 * SIZE_OF_FLOAT, 0);
        gl.drawElements(gl.TRIANGLES, cubeIndicesFront.length, gl.UNSIGNED_SHORT, 0);

        // Draw Coordinate Lines
        gl.polygonOffset(0, 0);
        gl.disable(gl.POLYGON_OFFSET_FILL);

        gl.uniform3fv(quadProgram.uniformLocations['u_color'], outlineColor);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeOutlineIndexBuffer);

        // Top
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferTop);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4 * SIZE_OF_FLOAT, 0);
        gl.drawElements(gl.LINES, cubeOutlineIndices.length, gl.UNSIGNED_SHORT, 0);

        // Left
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferLeft);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4 * SIZE_OF_FLOAT, 0);
        gl.drawElements(gl.LINES, cubeOutlineIndices.length, gl.UNSIGNED_SHORT, 0);

        // Front
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeOutlineIndexBufferFront);

        gl.bindBuffer(gl.ARRAY_BUFFER, cubeBufferFront);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 4 * SIZE_OF_FLOAT, 0);
        gl.drawElements(gl.LINES, cubeOutlineIndicesFront.length, gl.UNSIGNED_SHORT, 0);
    }
}
