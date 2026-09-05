/*
 * Ribbon Field background — adapted from ThreeUI (github.com/MengTo/threeui).
 * Original code Copyright (c) 2026 Meng To, MIT License:
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { useEffect, useRef } from "react";
import { RIBBON_FIELD_FRAGMENT_SHADER, RIBBON_FIELD_VERTEX_SHADER } from "./ribbonFieldShaders";

// Local adaptation of the ThreeUI source: color grading (saturation/brightness)
// moved from a CSS filter on the canvas into shader uniforms — Gecko-based
// browsers (Firefox/Floorp) repaint filtered canvases on the compositor every
// frame, which made the full-viewport effect laggy. hue stays CSS-based (unused
// at its default 0); maxPixelRatio caps the backing resolution.
export type RibbonFieldBackgroundProps = { speed?: number; pointerAmount?: number; smoothing?: number; brightness?: number; opacity?: number; hue?: number; saturation?: number; maxPixelRatio?: number; className?: string };
export const RIBBON_FIELD_DEFAULTS = { speed: 1, pointerAmount: 1, smoothing: 0.035, brightness: 1, opacity: 1, hue: 0, saturation: 1, maxPixelRatio: 2 } as const;
function compile(gl: WebGLRenderingContext, type: number, source: string) { const shader = gl.createShader(type); if (!shader) throw new Error("Unable to create Axiom shader"); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Axiom shader compilation failed"); return shader; }

export function RibbonFieldBackground({ className = "", ...props }: RibbonFieldBackgroundProps) {
  const hostRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null); const optionsRef = useRef({ ...RIBBON_FIELD_DEFAULTS, ...props }); optionsRef.current = { ...RIBBON_FIELD_DEFAULTS, ...props };
  useEffect(() => {
    const host = hostRef.current, canvas = canvasRef.current; if (!host || !canvas) return undefined; const gl = canvas.getContext("webgl", { alpha: true, antialias: false, premultipliedAlpha: false }); if (!gl) return undefined;
    const vertex = compile(gl, gl.VERTEX_SHADER, RIBBON_FIELD_VERTEX_SHADER), fragment = compile(gl, gl.FRAGMENT_SHADER, RIBBON_FIELD_FRAGMENT_SHADER), program = gl.createProgram(); if (!program) return undefined; gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Axiom program link failed"); gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW); const position = gl.getAttribLocation(program, "position"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, "resolution"), time = gl.getUniformLocation(program, "time"), pointerUniform = gl.getUniformLocation(program, "pointer"), saturationUniform = gl.getUniformLocation(program, "saturation"), brightnessUniform = gl.getUniformLocation(program, "brightness"); let mouseX = 0.72, mouseY = 0.42, targetX = 0.72, targetY = 0.42, frame = 0, visible = true; const startedAt = performance.now();
    const pointer = (event: PointerEvent) => { const bounds = host.getBoundingClientRect(); targetX = 0.72 + (((event.clientX - bounds.left) / Math.max(bounds.width, 1)) - 0.72) * optionsRef.current.pointerAmount; targetY = 0.42 + ((1 - (event.clientY - bounds.top) / Math.max(bounds.height, 1)) - 0.42) * optionsRef.current.pointerAmount; };
    const resize = () => { const bounds = host.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, optionsRef.current.maxPixelRatio); canvas.width = Math.max(1, Math.floor(bounds.width * ratio)); canvas.height = Math.max(1, Math.floor(bounds.height * ratio)); gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(resolution, canvas.width, canvas.height); };
    const render = (now: number) => { const options = optionsRef.current; mouseX += (targetX - mouseX) * options.smoothing; mouseY += (targetY - mouseY) * options.smoothing; gl.uniform1f(time, (now - startedAt) * 0.001 * options.speed); gl.uniform2f(pointerUniform, mouseX, mouseY); gl.uniform1f(saturationUniform, options.saturation); gl.uniform1f(brightnessUniform, options.brightness); gl.drawArrays(gl.TRIANGLES, 0, 6); frame = visible && !document.hidden ? requestAnimationFrame(render) : 0; };
    const resizeObserver = new ResizeObserver(resize), intersection = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? true; if (visible && !frame) frame = requestAnimationFrame(render); if (!visible && frame) cancelAnimationFrame(frame), frame = 0; }); resizeObserver.observe(host); intersection.observe(host); host.addEventListener("pointermove", pointer, { passive: true }); resize(); frame = requestAnimationFrame(render);
    // When the tab is hidden the pending rAF can resolve with document.hidden
    // true, leaving frame=0 with nothing scheduled. Restart on return.
    const onVisibility = () => { if (!document.hidden && visible && !frame) frame = requestAnimationFrame(render); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { if (frame) cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect(); host.removeEventListener("pointermove", pointer); document.removeEventListener("visibilitychange", onVisibility); gl.deleteBuffer(buffer); gl.deleteShader(vertex); gl.deleteShader(fragment); gl.deleteProgram(program); };
  }, []);
  const options = optionsRef.current; return <div ref={hostRef} className={`threeui-background ribbon-field${className ? ` ${className}` : ""}`}><canvas ref={canvasRef} style={{ opacity: options.opacity, filter: options.hue !== 0 ? `hue-rotate(${options.hue}deg)` : undefined }} /></div>;
}
