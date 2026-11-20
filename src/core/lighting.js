// A short, four-tap bloom pass. Keep underlay transparency so the CSS nebula
// remains visible. Canvas clients still receive all primary light cues.
const fragment = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform vec2 uStep;
varying vec2 outTexCoord;
vec3 emission(vec4 s) { return max(s.rgb - vec3(.48), vec3(0.0)); }
void main() {
  vec2 uv = outTexCoord;
  vec4 base = texture2D(uMainSampler, uv);
  vec3 glow = emission(texture2D(uMainSampler, uv + vec2(uStep.x, 0.0)))
            + emission(texture2D(uMainSampler, uv - vec2(uStep.x, 0.0)))
            + emission(texture2D(uMainSampler, uv + vec2(0.0, uStep.y)))
            + emission(texture2D(uMainSampler, uv - vec2(0.0, uStep.y)));
  glow *= .15;
  gl_FragColor = vec4(min(base.rgb + glow, vec3(1.0)), min(base.a + max(glow.r, max(glow.g, glow.b)), 1.0));
}`;

export function installBloom(scene, phaser) {
  const manager = scene.game.renderer.pipelines;
  if (!manager) return;
  class FrontierBloom extends phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
    constructor(game) {
      super({ game, fragShader: fragment });
    }
    onDraw(target) {
      this.set2f("uStep", 2 / target.width, 2 / target.height);
      this.bindAndDraw(target);
    }
  }
  manager.addPostPipeline("FrontierBloom", FrontierBloom);
  scene.cameras.main.setPostPipeline("FrontierBloom");
}
