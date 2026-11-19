import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from "three";

/**
 * X-RAY MATERIAL — custom GLSL.
 *
 * Fresnel = how "edge-on" a surface is to the camera. Surfaces facing us are
 * transparent, silhouettes glow. A scan band (uSweep) travels along the car's
 * length driven by uTime from JavaScript.
 *
 *   uniforms  : JS → GPU, same for every vertex/pixel (uTime, uOpacity…)
 *   attributes: per-vertex data from the GLB (position, normal)
 *   varyings  : vertex shader → fragment shader, interpolated per pixel
 */
export function createXrayMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSweep: { value: 0 },
      uColor: { value: new Color("#5fe3ff") },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec4 mvPos = viewMatrix * worldPos;
        vWorldPos = worldPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform float uSweep;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldPos;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 2.2);
        float band = smoothstep(0.12, 0.0, abs(vWorldPos.z - uSweep));
        float lines = smoothstep(0.92, 1.0, fract(vWorldPos.y * 28.0 - uTime * 0.35)) * 0.3;
        vec3 color = uColor * (0.25 + fresnel) + vec3(band * 0.4);
        // Additive blending stacks every overlapping layer (body + interior + glass),
        // so keep per-layer alpha low and let the silhouettes do the work.
        float alpha = (0.008 + fresnel * 0.22 + lines * fresnel * 0.5 + band * 0.08) * uOpacity;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

/**
 * STUDIO FLOOR — radial fade into the background + a fine grid that scrolls
 * with uTravel (accumulated in JS from wheel speed) so the car feels like it
 * is driving even though the mesh never moves.
 */
export function createFloorMaterial(bg: string) {
  return new ShaderMaterial({
    uniforms: {
      uTravel: { value: 0 },
      uBg: { value: new Color(bg) },
      uFloor: { value: new Color("#1a1c20") },
      uLine: { value: new Color("#3a3e46") },
      uAccent: { value: new Color("#c8261c") },
      uXray: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTravel;
      uniform float uXray;
      uniform vec3 uBg;
      uniform vec3 uFloor;
      uniform vec3 uLine;
      uniform vec3 uAccent;
      varying vec2 vPos;

      float gridLine(float coord, float width) {
        float d = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
        return 1.0 - min(d / width, 1.0);
      }

      void main() {
        float r = length(vPos);
        float fade = smoothstep(11.0, 2.5, r);
        // plane is rotated -90° on X, so local y maps to world -z (car's length axis)
        vec2 p = vPos * 0.5;
        p.y += uTravel;
        float g = max(gridLine(p.x, 1.0), gridLine(p.y, 1.0)) * 0.55;
        vec3 col = mix(uFloor, uLine, g * smoothstep(9.0, 1.5, r));
        // soft spotlight pool under the car
        col += uAccent * 0.05 * smoothstep(4.0, 0.0, r) * (1.0 - uXray);
        col += vec3(0.1, 0.45, 0.55) * 0.1 * smoothstep(5.0, 0.0, r) * uXray;
        gl_FragColor = vec4(mix(uBg, col, fade), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}
