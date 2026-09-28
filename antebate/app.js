import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

const wrap = document.querySelector('#canvas-wrap');
const status = document.querySelector('#status');
const reset = document.querySelector('#reset');
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000,0);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.3;
renderer.outputColorSpace = THREE.SRGBColorSpace;
wrap.append(renderer.domElement);
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label','3Dモデル。ドラッグで回転、スクロールで拡大。');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32,1,0.01,50);
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 0.85;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI * 0.94;
RectAreaLightUniformsLib.init();

// Geometry remains in meters in the GLB; only the viewer root is normalized.
const worldToThree = new THREE.Matrix4().makeRotationX(-Math.PI/2);
let ready = false;
let bottleSpin;
let homeDirection = new THREE.Vector3(0.8,0.13,0.6).normalize();
function fit(){
  const aspect=wrap.clientWidth/wrap.clientHeight;
  camera.aspect=aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(wrap.clientWidth,wrap.clientHeight);
}
function home(){
  controls.target.set(0,0,0);
  const vfov=THREE.MathUtils.degToRad(camera.fov);
  const distance=Math.max(1.45/(2*Math.tan(vfov/2)),1.05/(2*Math.tan(vfov/2)*camera.aspect));
  camera.position.copy(homeDirection).multiplyScalar(distance);
  controls.update();
}
let previousWidth=wrap.clientWidth;
new ResizeObserver(()=>{const changed=previousWidth!==wrap.clientWidth;previousWidth=wrap.clientWidth;fit();if(ready && changed)home();}).observe(wrap);
fit();

function area(name,color,intensity,width,height,position,target=new THREE.Vector3()){
  const light=new THREE.RectAreaLight(color,intensity,width,height);
  light.name=name;light.position.copy(position);light.lookAt(target);scene.add(light);
  return light;
}
async function start(){
  const [gltf,info]=await Promise.all([
    new GLTFLoader().loadAsync('./assets/bottle_01.glb'),
    fetch('./assets/scene-info.json').then(r=>{if(!r.ok)throw Error('Lighting metadata missing');return r.json();})
  ]);
  const model=gltf.scene;
  const bounds=new THREE.Box3().setFromObject(model);
  const center=bounds.getCenter(new THREE.Vector3());
  const size=bounds.getSize(new THREE.Vector3());
  if(!(size.y>0))throw Error('Empty model');
  const scale=1/size.y;
  const root=new THREE.Group();root.scale.setScalar(scale);root.position.copy(center).multiplyScalar(-scale);root.add(model);
  bottleSpin=new THREE.Group();bottleSpin.add(root);
  const bottleTilt=new THREE.Group();bottleTilt.add(bottleSpin);scene.add(bottleTilt);
  model.traverse(o=>{if(o.isMesh){for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(m.map)m.map.anisotropy=renderer.capabilities.getMaxAnisotropy();}}});
  // Blender's disk area light has no glTF equivalent. Retain its color,
  // world transform and scaled size as a rectangular approximation. Intensities
  // are art-directed for the web, not a physical watt-to-luminance conversion.
  for(const source of info.lights.filter(l=>l.type==='AREA')){
    const matrix=new THREE.Matrix4().set(...source.matrix.flat()).premultiply(worldToThree);
    const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scaling=new THREE.Vector3();
    matrix.decompose(position,quaternion,scaling);
    const width=source.size*Math.abs(scaling.x)*scale;
    const height=(source.shape==='RECTANGLE'?source.size_y:source.size)*Math.abs(scaling.y)*scale;
    const light=area(source.name+' (approximated)',new THREE.Color().fromArray(source.color),2.5,width,height,position.sub(center).multiplyScalar(scale));
    light.quaternion.copy(quaternion);
  }
  area('Studio key',0xfff5e9,5,2.3,3,new THREE.Vector3(1.5,1.8,2));
  area('Studio rim',0xffffff,3,1.4,2.4,new THREE.Vector3(-1,1,-2));
  scene.add(new THREE.HemisphereLight(0xffffff,0xb5a79a,1.1));
  if(info.camera_matrix){const m=new THREE.Matrix4().set(...info.camera_matrix.flat()).premultiply(worldToThree);homeDirection.setFromMatrixPosition(m).sub(center).normalize();homeDirection.y=0.13;homeDirection.normalize();}
  // Turn the bottle clockwise in the initial camera's view plane.
  bottleTilt.quaternion.setFromAxisAngle(homeDirection,THREE.MathUtils.degToRad(-35));
  ready=true;home();status.hidden=true;
  reset.disabled=false;
  document.documentElement.dataset.viewer='ready';
}
reset.addEventListener('click',()=>{if(bottleSpin)bottleSpin.rotation.y=0;home();});
let last=performance.now();
renderer.setAnimationLoop(now=>{const delta=Math.min((now-last)/1000,0.05);last=now;if(document.hidden)return;if(bottleSpin)bottleSpin.rotation.y+=(Math.PI*2/50)*delta;controls.update(delta);renderer.render(scene,camera);});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();status.hidden=false;status.textContent='3D描画が中断されました。ページを再読み込みしてください。';});
start().catch(error=>{console.error(error);status.hidden=false;status.textContent='モデルを読み込めませんでした。ローカルサーバーから開き、assetsフォルダをご確認ください。';document.documentElement.dataset.viewer='error';});
