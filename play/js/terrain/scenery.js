class ModelLoader {
    constructor() {
        this.loader = new THREE.OBJLoader();
        this.cache = {};
        this.pending = {};
    }

    useTextureManager(textures) {
        this.textures = textures;
    }

    useShaderUniforms(uniforms) {
        this.shader_uniforms = uniforms;
    }

    /**
     * Loads a model with a potential texture and material.
     * 
     * Unique models are model + material (optional).
     * Texture is added to mesh after loading.
     */
    loadModel(modelInfo, callback) {
        let key = modelInfo.model;
        if (modelInfo.material) key += modelInfo.material;

        if (key == 'polygon') {
            let geometry = new THREE.PlaneGeometry( 1, 1.6, 1, 1 ); // WALL_HEIGHT
            let material = new THREE.MeshBasicMaterial( {color: 0xffffff, side: THREE.DoubleSide} );
            let plane = new THREE.Mesh( geometry, material );
            plane.matrixAutoUpdate = false;

            callback(this.applyTextures(modelInfo, plane));
            return;
        }

        if (key == 'fishing-spot') {
            let geometry = new THREE.PlaneGeometry( 1, 1, 1, 1 );
            let material = new THREE.MeshBasicMaterial( {
                color: 0xffffff, 
                side: THREE.DoubleSide
            } );
            let plane = new THREE.Mesh( geometry, material );
            plane.matrixAutoUpdate = false;
            plane.renderOrder = 20;

            callback(this.applyTextures(modelInfo, plane));
            return;
        }

        if (this.pending[key]) {
            this.pending[key].callbacks.push({ modelInfo: modelInfo, callback: callback });
            return;
        }

        this.pending[key] = {callbacks:[{ modelInfo: modelInfo, callback: callback }]};

        if (modelInfo.material) {
            var mtlLoader = new THREE.MTLLoader();
            mtlLoader.load('/static/models/' + modelInfo.material, (materials) => {
                materials.preload();
                let loader = new THREE.OBJLoader();
                loader.setMaterials( materials );
                loader.load('/static/models/' + modelInfo.model, (model) => {
                    this.loadedModel(key, modelInfo, model);    
                });
            });
        } else {
            this.loader.load('/static/models/' + modelInfo.model, (model) => {
                this.loadedModel(key, modelInfo, model);
            });
        }
    }

    loadedModel(key, modelInfo, model) {
        model.matrixAutoUpdate = false;
        this.cache[key] = model;
        for (let c in this.pending[key].callbacks) {
            this.pending[key].callbacks[c].callback(
                this.applyTextures(this.pending[key].callbacks[c].modelInfo, model)
            );
        }
        delete this.pending[key];
    }

    /**
     * Returns a clone of the mesh with textures applied.
     */
    applyTextures(definition, mesh) {
        let clone = mesh.clone();
        
        if (!definition.texture && !definition.color && !definition.shader) return clone;

        // TODO: If material already set, just change the map...
        clone.traverse( (n) => {
            if (n.isMesh) {
                n.material = n.material.clone();
                n.material.side = THREE.DoubleSide;

                if (definition.color) {
                    n.material.color = new THREE.Color(definition.color);
                }

                if (definition.texture) {
                    n.material.transparent = true;
                    n.material.map = this.textures.getUri('/static/models/' + definition.texture);
                    n.material.alphaTest = definition.alphaTest || 0.5;
                }
                n.material.needsUpdate = true;
            }
        });

        // Apply shader, if any.
        if (definition.shader) {
            fetch('/static/shaders/' + definition.shader)
                .then( response => response.text() )
                .then( (response) => {
                    let shaderMaterial = new THREE.ShaderMaterial({
                        uniforms: this.shader_uniforms,
                        vertexShader: 
                            " varying vec2 vUv; " +
                            " void main() " +
                            " {" +
                            " vUv = uv;" +
                            " vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);" +
                            " gl_Position = projectionMatrix * modelViewPosition; " +
                            " }",
                        fragmentShader: response,
                        transparent: true,
                        alphaTest: 0.1,
                    });

                    clone.traverse( (n) => {
                        if (n.isMesh) {
                            n.material = shaderMaterial;
                        }
                    });
                })
        }

        return clone;
    }
}

class SceneryLoader {
    constructor() {}

    useModelLoader(models) {
        this.loader = models;
    }

    useSceneryDefinitions(defs) {
        this.definitions = defs;
    }

    createScenery(definition, callback) {
        let m = this.definitions[definition.object];

        if (!m) {
            console.log("Invalid model: " + definition.object)
            return;
        }

        this.loader.loadModel(m, (mesh) => {
            mesh.matrix.identity();
            if (m.scale) mesh.scale.set(m.scale.x, m.scale.y, m.scale.z);

            if (m.position) {
                mesh.translateX(N(m.position.x));
                mesh.translateY(N(m.position.y));
                mesh.translateZ(N(m.position.z));
            }

            if (m.rotation) {
                mesh.translateX(0.5);
                mesh.translateZ(0.5);
                mesh.rotateY(THREE.Math.degToRad(m.rotation));
                mesh.translateZ(-0.5);
                mesh.translateX(-0.5);
                mesh.updateMatrix();
            }

            if (m.model == 'fishing-spot') {
                mesh.rotateX(THREE.Math.degToRad(-90));
            }

            mesh.translateX(-0.5);
            mesh.translateZ(-0.5);

            mesh.updateMatrix();

            let reset = (v) => {
                let wrapper = new THREE.Object3D();
                wrapper.add(mesh);
    
                if (v.hasOwnProperty('x') && v.hasOwnProperty('y')) {
                    wrapper.translateX(N(v.x) + 0.5);
                    wrapper.translateZ(N(v.y) + 0.5);
                }
    
                wrapper.rotation.set(0, THREE.Math.degToRad(v.rotation || 0.0), 0);

                wrapper.reset = reset;

                return wrapper;
            }

            callback(reset(definition), m);
        });
    }
}