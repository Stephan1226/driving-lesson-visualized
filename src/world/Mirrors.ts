import * as THREE from 'three';

export type MirrorId = 'left' | 'right' | 'room';

interface MirrorDef {
  glass: THREE.Mesh;
  cam: THREE.PerspectiveCamera;
  rt: THREE.WebGLRenderTarget;
  hudMat: THREE.MeshBasicMaterial;
}

/**
 * 실제로 반사되는 미러: 운전자 눈 → 거울 시선을 법선으로 반사한 방향을 렌더 타깃에 그려
 * 거울 유리와 화면 인셋(HUD)에 사용한다.
 */
export class Mirrors {
  enabled = false;
  private defs = new Map<MirrorId, MirrorDef>();
  private hudScene = new THREE.Scene();
  private hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private hudQuad: THREE.Mesh;

  constructor(glasses: Record<MirrorId, THREE.Mesh>) {
    for (const id of Object.keys(glasses) as MirrorId[]) {
      const room = id === 'room';
      const rt = new THREE.WebGLRenderTarget(room ? 768 : 512, room ? 192 : 256, { type: THREE.HalfFloatType });
      rt.texture.repeat.x = -1;
      rt.texture.offset.x = 1;
      rt.texture.wrapS = THREE.ClampToEdgeWrapping;
      const cam = new THREE.PerspectiveCamera(room ? 10 : 15, room ? 4 : 2, 0.05, 900);
      const glass = glasses[id];
      glass.material = new THREE.MeshBasicMaterial({ map: rt.texture });
      this.defs.set(id, { glass, cam, rt, hudMat: new THREE.MeshBasicMaterial({ map: rt.texture, depthTest: false }) });
    }
    this.hudQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.hudScene.add(this.hudQuad);
  }

  /** 눈 위치(월드)에서 각 거울을 렌더 */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, eye: THREE.Vector3) {
    if (!this.enabled) return;
    const m = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const d of this.defs.values()) {
      if (!d.glass.parent?.visible) continue;
      d.glass.updateWorldMatrix(true, false);
      d.glass.getWorldPosition(m);
      n.set(0, 0, 1).transformDirection(d.glass.matrixWorld);
      const v = m.clone().sub(eye).normalize();
      const r = v.addScaledVector(n, -2 * v.dot(n));
      d.cam.position.copy(m);
      d.cam.up.set(0, 1, 0);
      d.cam.lookAt(m.clone().add(r));
      d.cam.updateMatrixWorld();
      d.glass.visible = false;
      renderer.setRenderTarget(d.rt);
      renderer.render(scene, d.cam);
      d.glass.visible = true;
    }
    renderer.setRenderTarget(null);
  }

  /** 화면 위 사각형(CSS px)에 거울 화면을 확대해서 그린다 */
  drawHud(renderer: THREE.WebGLRenderer, id: MirrorId, rect: DOMRect, canvasH: number) {
    const d = this.defs.get(id);
    if (!d) return;
    this.hudQuad.material = d.hudMat;
    renderer.setScissorTest(true);
    const y = canvasH - rect.bottom;
    renderer.setScissor(rect.left, y, rect.width, rect.height);
    renderer.setViewport(rect.left, y, rect.width, rect.height);
    renderer.render(this.hudScene, this.hudCam);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
  }
}
