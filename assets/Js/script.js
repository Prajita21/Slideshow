import {Curtains, Plane} from 'https://cdn.jsdelivr.net/npm/curtainsjs@7.1.0/src/index.mjs';
//import fragment from './shaders/fragment.glsl'; //path to local file, instead of creating the variables below
//import vertex from './shaders/vertex.glsl'; //path to local file, instead of creating the variables below

const fragment = `
precision mediump float;

varying vec3 vVertexPosition;
varying vec2 vTextureCoord;
varying vec2 vActiveTextureCoord;
varying vec2 vNextTextureCoord;

// custom uniforms
uniform float uTransitionTimer;

// our textures samplers
// notice how it matches the sampler attributes of the textures we created dynamically
uniform sampler2D activeTexture;
uniform sampler2D nextTexture;
uniform sampler2D displacement;

void main() {
    // our displacement texture
    vec4 displacementTexture = texture2D(displacement, vTextureCoord);

    // slides transitions based on displacement and transition timer
    vec2 firstDisplacementCoords = vActiveTextureCoord + displacementTexture.r * ((cos((uTransitionTimer + 90.0) / (90.0 / 3.141592)) + 1.0) / 1.25);
    vec4 firstDistortedColor = texture2D(activeTexture, vec2(vActiveTextureCoord.x, firstDisplacementCoords.y));

    // same as above but we substract the effect
    vec2 secondDisplacementCoords = vNextTextureCoord - displacementTexture.r * ((cos(uTransitionTimer / (90.0 / 3.141592)) + 1.0) / 1.5);
    vec4 secondDistortedColor = texture2D(nextTexture, vec2(vNextTextureCoord.x, secondDisplacementCoords.y));

    // mix both texture
    vec4 finalColor = mix(firstDistortedColor, secondDistortedColor, 1.0 - ((cos(uTransitionTimer / (90.0 / 3.141592)) + 1.0) / 2.0));

    // handling premultiplied alpha
    finalColor = vec4(finalColor.rgb * finalColor.a, finalColor.a);

    gl_FragColor = finalColor;
}
`;

const vertex = `
precision mediump float;

// default mandatory variables
attribute vec3 aVertexPosition;
attribute vec2 aTextureCoord;
uniform mat4 uMVMatrix;
uniform mat4 uPMatrix;

// textures matrices
uniform mat4 activeTextureMatrix;
uniform mat4 nextTextureMatrix;

// varyings : notice we've got 3 texture coords varyings
// displacement texture / visible texture / upcoming texture
varying vec3 vVertexPosition;
varying vec2 vTextureCoord; // displacement
varying vec2 vActiveTextureCoord;
varying vec2 vNextTextureCoord;

// custom uniforms
uniform float uTransitionTimer;


void main() {
    gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);

    // varyings
    // use original texture coords for our displacement
    vTextureCoord = aTextureCoord;
    vActiveTextureCoord = (activeTextureMatrix * vec4(aTextureCoord, 0.0, 1.0)).xy;
    vNextTextureCoord = (nextTextureMatrix * vec4(aTextureCoord, 0.0, 1.0)).xy;

    vVertexPosition = aVertexPosition;
}
`; 

class WebglSlides {
	constructor(set) {
		this.canvas = set.canvas

		this.planeElement = set.planeElement
		this.multiTexturesPlane = null
		this.slidesState = {
			activeTextureIndex: 1,
			nextTextureIndex: null,
			maxTextures: set.planeElement.querySelectorAll("img").length - 1, // -1 to displacement
			navs: set.navs,

			isChanging: false,
			transitionTimer: 0,
		}
		this.params = {
			vertexShader: vertex,
			fragmentShader: fragment,
			uniforms: {
				transitionTimer: {
					name: "uTransitionTimer",
					type: "1f",
					value: 0,
				},
			},
		}

		this.init()
	}

	init() {
		this.setupCurtains()
		this.initPlane()
		this.update()
	}

	setupCurtains() {
		this.curtains = new Curtains({
			container: this.canvas,
			watchScroll: false,
			pixelRatio: Math.min(1.5, window.devicePixelRatio)
		})
		this.curtains.onError(() => this.error());
		this.curtains.onContextLost(() => this.restoreContext());
	}

	initPlane() {
		this.multiTexturesPlane = new Plane(this.curtains, this.planeElement, this.params)

		this.multiTexturesPlane
			.onLoading(texture => {
				texture.setMinFilter(this.curtains.gl.LINEAR_MIPMAP_NEAREST)
			})
			.onReady(() => {
				const activeTexture = this.multiTexturesPlane.createTexture({
					sampler: "activeTexture",
					fromTexture: this.multiTexturesPlane.textures[this.slidesState.activeTextureIndex]
				})
				const nextTexture = this.multiTexturesPlane.createTexture({
					sampler: "nextTexture",
					fromTexture: this.multiTexturesPlane.textures[this.slidesState.nextTextureIndex]
				})

				this.initEvent(activeTexture, nextTexture)

			})
	}

	update() {
		this.multiTexturesPlane.onRender(() => {
			if (this.slidesState.isChanging) {
				this.slidesState.transitionTimer += (90 - this.slidesState.transitionTimer) * 0.04;

				if (this.slidesState.transitionTimer >= 88.5 && this.slidesState.transitionTimer !== 90) {
					this.slidesState.transitionTimer = 90;
				}
			}

			this.multiTexturesPlane.uniforms.transitionTimer.value = this.slidesState.transitionTimer;
		});
	}

	initEvent(activeTexture, nextTexture) {
		this.slidesState.navs.forEach(nav => {
			nav.addEventListener('click', event => {

				if (!this.slidesState.isChanging) {
					this.curtains.enableDrawing()

					this.slidesState.isChanging = true;

					const to = event.target.getAttribute('data-goto');
					this.navigationDirection(to);

					nextTexture.setSource(this.multiTexturesPlane.images[this.slidesState.nextTextureIndex]);

					setTimeout(() => {

						this.curtains.disableDrawing();

						this.slidesState.isChanging = false;
						this.slidesState.activeTextureIndex = this.slidesState.nextTextureIndex;

						activeTexture.setSource(this.multiTexturesPlane.images[this.slidesState.activeTextureIndex]);

						this.slidesState.transitionTimer = 0;

					}, 1700);
				}
			})
		})
	}

	navigationDirection(to) {
		if (to == 'next') {
			if (this.slidesState.activeTextureIndex < this.slidesState.maxTextures) {
				this.slidesState.nextTextureIndex = this.slidesState.activeTextureIndex + 1
			} else {
				this.slidesState.nextTextureIndex = 1
			}
		} else {
			if (this.slidesState.activeTextureIndex <= 1) {
				this.slidesState.nextTextureIndex = this.slidesState.maxTextures
			} else {
				this.slidesState.nextTextureIndex = this.slidesState.activeTextureIndex - 1
			}
		}
	}

	error() {
		document.body.classList.add("no-curtains", "image-1");

		this.slidesState.navs.forEach(nav => {
			nav.addEventListener("click", event => {
				const to = event.target.getAttribute('data-goto');
				navigationDirection(to);

				document.body.classList.remove("image-1", "image-2", "image-3", "image-4");
				document.body.classList.add("image-" + this.slidesState.nextTextureIndex);

				this.slidesState.activeTextureIndex = this.slidesState.nextTextureIndex;

			});
		})
	}

	restoreContext() {
		this.curtains.restoreContext();
	}

	removePlanes() {
		this.curtains.dispose();
	}

}

window.addEventListener("load", () => {
	const wrapper = document.querySelector('.wrapper')
	const canvas = wrapper.querySelector('.canvas')
	const planeElement = wrapper.querySelector('.multi-textures')
	const navs = wrapper.querySelectorAll('[data-goto]')
	let slide = new WebglSlides({
		canvas,
		planeElement,
		navs
	})
  
  // Down, not necesary, only for change Displacements Texture
	document.querySelector('.js-open-modal').addEventListener('click', () => {
    document.body.classList.add('modal-active')
  })
  document.querySelector('.js-close-modal').addEventListener('click', () => {
    document.body.classList.remove('modal-active')
	})

	const settings = document.querySelectorAll('[data-setting]');
	settings.forEach(setting => {
		setting.addEventListener('click', event => {
			const target = event.target;
			const path = target.getAttribute('src')
			settings.forEach(setting => setting.classList.remove('active'))
			target.classList.add('active')
			console.log('path :>> ', path);
			document.querySelector('[data-sampler]').src = path
	
			slide.removePlanes()
			slide = new WebglSlides({
				canvas,
				planeElement,
				navs
			})
		})
	})
});
