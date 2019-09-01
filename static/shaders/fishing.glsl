#ifdef GL_ES
precision mediump float;
#endif

uniform float u_time;
varying vec2 vUv;

#define EPSILON 0.05

bool eq(float left, float right) {
    return abs(left - right) < EPSILON;
}

// there's a built-in distance function
float dist(vec2 a, vec2 b) {
    float dx = a.x - b.x;
    float dy = a.y - b.y;
    return sqrt(dx * dx + dy * dy);
}

vec4 addCircle(vec2 st, vec4 color, vec2 center, float radius, float dt) {
    if (eq( dist(st, center) / radius , dt )) {
     	color += vec4(1.0,1.0,1.0,1.0-dt);
    }
    return color;
}

void main() {
    vec2 st = vec2(vUv.x, vUv.y);
    
    vec4 color = vec4(0.0,0.0,0.0,0.0);
        
    color = addCircle(st, color, vec2(0.300,0.880), 0.1, fract(u_time + 0.3));
    color = addCircle(st, color, vec2(0.310,0.360), 0.3, fract(u_time + 0.5));
    color = addCircle(st, color, vec2(0.820,0.490), 0.2, fract(u_time + 0.8));
    color = addCircle(st, color, vec2(0.580,0.210), 0.2, fract(u_time + 0.9));
    color = addCircle(st, color, vec2(0.630,0.670), 0.3, fract(u_time + 0.1));

    gl_FragColor = color;
}