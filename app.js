import * as THREE from "three";
import matcap from "./img/vialactea.jpeg";
import matcap1 from "./img/lua.jpeg";


const fragment = `
uniform float time;
uniform float progress;
uniform sampler2D matcap, matcap1;
uniform vec4 resolution;
uniform vec2 mouse;
varying vec2 vUv;
float PI = 3.14159265359;

//Função para fazer rotação parte 1
mat4 rotationMatrix(vec3 axis, float angle) {
  axis = normalize(axis);
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  
  return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
              oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
              oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
              0.0,                                0.0,                                0.0,                                1.0);
}

//Função para textura
vec2 getmatcap(vec3 eye, vec3 normal) {
  vec3 reflected = reflect(eye, normal);
  float m = 2.8284271247461903 * sqrt( reflected.z+1.0 );
  return reflected.xy / m + 0.5;
}

//Função para fazer rotação parte 2
vec3 rotate(vec3 v, vec3 axis, float angle) {
mat4 m = rotationMatrix(axis, angle);
return (m * vec4(v, 1.0)).xyz;
}

//Função para suavizar as arestas
float smin( float a, float b, float k )
{
    float h = clamp( 0.5+0.5*(b-a)/k, 0.0, 1.0 );
    return mix( b, a, h ) - k*h*(1.0-h);
}

//Função da esfera
float sdSphere(vec3 p, float r){
  return length(p) - r;
}

//Função do torus
float sdTorus( vec3 p, vec2 t )
{
  vec2 q = vec2(length(p.xz)-(t*3.5).x,p.y);

  return length(q)-t.y;
}

//Função da piramide dupla
float sdOctahedron( vec3 p, float s)
{
  p = abs(p);
  return (p.x+p.y+p.z-s)*0.57735027;
}

float rand(vec2 co){
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}



//Criando a cena
vec2 sdf(vec3 p){
  vec3 p1 = rotate(p, vec3(4.), time/1.);
  float time2 = 0.;
  float type = 0.;
  float torus = sdTorus(p1, vec2(0.08));
  float final = torus;

  //Criando Octahedrons e fazendo eles se moverem em direção ao mouse
    for(float i=0.; i<3.; i++){
      float randOffset = rand(vec2(i*2.,0.));
      float progr = fract(time - randOffset *10.)*3.;
      vec3 pos = normalize(vec3(mouse*resolution.zw*2., 0.) - vec3(0.));
      float gotoCenter = sdOctahedron(p - pos * progr, 0.1);
    
      final = smin(final, gotoCenter, 0.1);
      
    }
  //Criando a esfera conectada ao mouse
  float mouseSphere = sdSphere(p - vec3(mouse*resolution.zw*2.,0.), 0.05 + 0.001*sin(time));

  if(mouseSphere < final){
    type = 1.;
  }

  return vec2(smin(final, mouseSphere, 0.05), type);
}
  

// calcular normais para sombreamento
vec3 calcNormal( in vec3 p ) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps,0);
    return normalize( 
      vec3(sdf(p+h.xyy).x - sdf(p-h.xyy).x,
      sdf(p+h.yxy).x - sdf(p-h.yxy).x,
      sdf(p+h.yyx).x - sdf(p-h.yyx).x ) );
}

void main() {
  float dist = length(vUv - vec2(0.5));
  //background (recebe 2 cores e a distancia entre elas)
  vec3 bg = mix(vec3(0.5), vec3(0.0), dist);

  vec2 newUV = (vUv - vec2(0.5)) * resolution.zw + vec2(0.5);
  // camera position
  vec3 camPos = vec3(0., 0., 2.);
  // view ray
  vec3 ray = normalize(vec3((vUv - vec2(0.5)) * resolution.zw, -1));

  // Ray Marching
  vec3 rayPos = camPos;
  float t=0.;
  float tMax = 5.;
  float type = -1.;
  for(int i=0; i<256; i++){
    vec3 pos = camPos + t*ray;
    float h = sdf(pos).x;
    type = sdf(pos).y;
    if(h<0.001) break;
    t += h;
  }

  vec3 color = bg;
  if(t<tMax){
    //aqui ele está atingindo a superficie
    vec3 pos = camPos + t*ray;
    color = vec3(1.);
    vec3 normal = calcNormal(pos);
    color = normal;
    float diff = dot(vec3(1.), normal);
    vec2 matcapUV = getmatcap(ray, normal);
    color = vec3(diff);

    if(type<0.5){
      color = texture2D(matcap, matcapUV).rgb;
    }else {
      color = texture2D(matcap1, matcapUV).rgb;
    }


    //suaviza a iluminação das bordas do objeto com o fundo
    float fresnel = pow(1. - dot(normal, -ray), 3.);
    color = mix(color,bg,fresnel);
  }

  gl_FragColor = vec4(color, 1.);

}
`;

const vertex = `varying vec2 vUv;
varying vec2 vCoordinates;
attribute vec3 aCoordinates;

void main(){
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;

  vCoordinates = aCoordinates.xy;
}`;

export default class Sketch {
  constructor(options) {
    this.scene = new THREE.Scene();
    this.container = options.dom;
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio));
    this.renderer.setSize(this.width, this.height);
    this.renderer.setClearColor(0xeeeeee, 1);
    this.renderer.physicallyCorrectLights = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    var frustumSize = 1;

    this.camera = new THREE.OrthographicCamera(
      frustumSize / -2,
      frustumSize / 2,
      frustumSize / 2,
      frustumSize / -2,
      1,
      2000
    );

    this.camera.position.set(0, 0, 2);

    this.time = 0;

    this.isPlaying = true;
    this.audio = new Audio();
    this.audio.volume;
    this.addObjects();
    this.resize();
    this.render();
    this.setupResize();
    this.mouseEvents();

    this.settings();
  }

  mouseEvents() {
    this.mouse = new THREE.Vector2();
    document.addEventListener("mousemove", (event) => {
      this.mouse.x = event.pageX / this.width - 0.5;
      this.mouse.y = -event.pageY / this.height + 0.5;
    });
  }

  settings() {
    this.settings = {
      progress: 0,
    };
  }

  setupResize() {
    window.addEventListener("resize", this.resize.bind(this));
  }

  resize() {
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;

    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;

    // image convert to plane
    this.imageAspect = 1;
    let a1;
    let a2;
    if (this.height / this.width > this.imageAspect) {
      a1 = (this.width / this.height) * this.imageAspect;
      a2 = 1;
    } else {
      a1 = 1;
      a2 = this.height / this.width / this.imageAspect;
    }

    this.material.uniforms.resolution.value.x = this.width;
    this.material.uniforms.resolution.value.y = this.height;
    this.material.uniforms.resolution.value.z = a1;
    this.material.uniforms.resolution.value.w = a2;

    this.camera.updateProjectionMatrix();
  }

  addObjects() {
    this.material = new THREE.ShaderMaterial({
      extensions: {
        derivatives: "#extension GL_OES_standard_derivatives : enable",
      },
      side: THREE.DoubleSide,
      uniforms: {
        time: { value: 0 },
        progress: { value: 0 },
        mouse: { value: new THREE.Vector2(0, 0) },
        matcap: { value: new THREE.TextureLoader().load(matcap) },
        matcap1: { value: new THREE.TextureLoader().load(matcap1) },
        resolution: { value: new THREE.Vector4() },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
    });

    this.geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    this.plane = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.plane);
  }

  stop() {
    this.isPlaying = false;
  }

  play() {
    if (!this.isPlaying) {
      this.render();
      this.isPlaying = true;
    }
  }

  render() {
    if (!this.isPlaying) return;

    this.time += 0.01;
    this.material.uniforms.time.value = this.time;
    this.material.uniforms.progress.value = this.settings.progress;

    if (this.mouse) {
      this.material.uniforms.mouse.value = this.mouse;
    }

    requestAnimationFrame(this.render.bind(this));
    this.renderer.render(this.scene, this.camera);
  }
}

new Sketch({
  dom: document.getElementById("container"),
});
