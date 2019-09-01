// A rewrite of the terrain code to be more modular.
// TODO: Fix the missing roof configurations (diagonally joined roofs)
// TODO: Add half-tile roofs (diaga/diagb).

class TerrainMesh {
    constructor(params, raw, mesh, walls, roofs) {
        this.params = params;
        this.raw = raw;

        this.scene = undefined;
        this.showRoofs = true;

        this.mesh = mesh;
        this.walls = walls;
        this.roofs = roofs;
    }

    toggleRoofs() {
        this.setIndoorStatus(!this.showRoofs);
    }

    setIndoorStatus(indoors) {
        if (indoors && this.showRoofs) {
            if (this.scene) this.scene.remove(this.roofs);
            this.showRoofs = false;
        } else if (!indoors && !this.showRoofs) {
            if (this.scene) this.scene.add(this.roofs);
            this.showRoofs = true;
        }
    }

    addToScene(scene) {
        if (this.scene) throw "Already in scene";

        this.scene = scene;
        this.scene.add(this.mesh);
        this.scene.add(this.walls);
        if (this.showRoofs) this.scene.add(this.roofs);
    }

    removeFromScene() {
        if (!this.scene) throw "Not in a scene.";

        this.scene.remove(this.mesh);
        this.scene.remove(this.walls);
        if (this.showRoofs) this.scene.remove(this.roofs);
        delete this.scene;
    }

    /*isInside(localX, localY) {
        let xx = Math.floor(localX), yy = Math.floor(localY);
        if (xx < 0 || yy < 0 || xx >= wSIZE || yy >= wSIZE) return false;
        return this.mesh[xx][yy].indoor || false;
    }*/

    // TODO: Make this better?
    heightAt(x,y) {
        let xx = Math.floor(x) % wSIZE;
        let yy = Math.floor(y) % wSIZE;

        if (this.raw[xx][yy].override) {
            return this.raw[xx][yy].override;
        }

        let xxp = xx + 1 > wSIZE ? xx : xx + 1, yyp = yy + 1 > wSIZE ? yy : yy + 1;
        let px = 1.0 - (x - xx) / 1.0, py = 1.0 - (y - yy) / 1.0;

        let p0 = this.elevation(xx,yy);
        let p1 = this.elevation(xxp,yy);
        let p2 = this.elevation(xx,yyp);
        let p3 = this.elevation(xxp,yyp);

        let h0 = p0 * px + p1 * (1 - px);
        let h1 = p2 * px + p3 * (1 - px);
        let h = h0 * py + h1 * (1 - py);
        return h;
    }

    elevation(xx, yy) {
        return this.raw[xx][yy].elevation;
    }
}

const diaga_uvs_0 = [
    new THREE.Vector2(0,0),
    new THREE.Vector2(1,1),
    new THREE.Vector2(0,1),
];
const diaga_uvs_1 = [
    new THREE.Vector2(1,0),
    new THREE.Vector2(0,0),
    new THREE.Vector2(1,1),
];
const diagb_uvs_0 = [
    new THREE.Vector2(0,0),
    new THREE.Vector2(1,0),
    new THREE.Vector2(0,1),
];
const diagb_uvs_1 = [
    new THREE.Vector2(1,1),
    new THREE.Vector2(1,0),
    new THREE.Vector2(0,1),
];

let u0 = new THREE.Vector2(0,0);
let u1 = new THREE.Vector2(1,0);
let u2 = new THREE.Vector2(1,1);
let u3 = new THREE.Vector2(0,1);

function face(v0, v1, v2, material) {
    let face = new THREE.Face3(v0, v1, v2);
    face.materialIndex = material;
    return face;
}

class MeshLoader {
    constructor() {}

    useWallDefinitions(walls) {
        this.walls = walls;
    }

    useRoofDefinitions(roofs) {
        this.roofs = roofs;
    }

    useTextureManager(textureManager) {
        this.textureManager = textureManager;
    }

    /**
     * Iterates over all tiles in the mesh and populates a vertex for
     * every x/y coordinate in the mesh.
     */
    prepareVertices(mesh) {
        let geo = new THREE.Geometry();
        let curId = 0;

        let vertices = [];
        for (let x = 0; x <= wSIZE; x++) {
            vertices[x] = [];
            for (let y = 0; y <= wSIZE; y++) {
                let tile = mesh[x][y];

                // Defaulting
                if (!tile.draw) tile.draw = 'blend'; //tile.draw = 'explicit'
                if (!tile.orientation) tile.orientation = 'diagb';
                if (!tile.color) tile.color = { r: 255, g: 255, b: 255 };

                tile.threeColor = new THREE.Color(tile.color.r / 255, tile.color.g / 255, tile.color.b / 255);
                tile.threeShadowColor = 
                    new THREE.Color(
                        0.7 * tile.color.r / 255, 
                        0.7 * tile.color.g / 255,
                        0.7 * tile.color.b / 255);

                if (tile.secondary && tile.secondary.color) {
                    tile.secondary.threeColor = new THREE.Color(
                        tile.secondary.color.r / 255,
                        tile.secondary.color.g / 255,
                        tile.secondary.color.b / 255);
                    tile.secondary.threeShadowColor = new THREE.Color(
                        0.7 * tile.secondary.color.r / 255,
                        0.7 * tile.secondary.color.g / 255,
                        0.7 * tile.secondary.color.b / 255);
                }

                let pos = new THREE.Vector3(x, tile.elevation || 0.0, y);

                vertices[x][y] = { 
                    vector: pos,
                    index: curId++
                };
                geo.vertices.push(pos);
            }
        }

        return { geometry: geo, vertices: vertices };
    }

    materialIndex(materials, materialMap, type, texture) {
        if (!texture) return 0;
        if (materialMap[texture]) return materialMap[texture];

        let map = this.textureManager.get(texture);
        let material;
        if (type == 'lambert') {
            material = new THREE.MeshLambertMaterial( { 
                //vertexColors: THREE.VertexColors,
                map: map,
                side: THREE.FrontSide
            });
        } else if (type == 'basic') {
            material = new THREE.MeshBasicMaterial({
                map: map,
                transparent: true,
                alphaTest: 0.5,
                side: THREE.DoubleSide
            });
        }
        materialMap[texture] = materials.length;
        materials.push(material);

        return materialMap[texture];
    }
    
    // Figures out the neighbor vertex colors for t00.
    computeVertexColors(t00, t01, t10, t11) {
        let s00 = t00.shadow;
        let s01 = t01.shadow;
        let s10 = t10.shadow;
        let s11 = t11.shadow;

        let x00 = t00.draw == 'explicit';
        let x01 = t01.draw == 'explicit';
        let x10 = t10.draw == 'explicit';
        let x11 = t11.draw == 'explicit';

        // all four vertices share the same color.

        let selected01;
        let selected10;
        let selected11;
        if (x00) {
            selected01 = t00;
            selected10 = t00;
            selected11 = t00;
        } else {
            // otherwise we're blending
            selected01 = x01 ? t00 : t01;
            selected10 = x10 ? t00 : t10;

            if (!x11) {
                selected11 = t11;
            } else {
                if (x10 && !x01) {
                    selected11 = t01;
                } else if (x01 && !x10) {
                    selected11 = t10;
                } else {
                    selected11 = t00;
                }
            }
        }
            
        return {
            "00": !s00 ? t00.threeColor : t00.threeShadowColor,
            "01": !s01 ? selected01.threeColor : selected01.threeShadowColor,
            "10": !s10 ? selected10.threeColor : selected10.threeShadowColor,
            "11": !s11 ? selected11.threeColor : selected11.threeShadowColor,
        }
    }

    /**
     * Iterates over all tiles and actually creates the terrain faces
     * for those tiles.
     */
    populateGeometry(tiles, preparedVertices) {
        // Keep track of which material each texutre corresponds to.
        let materials = [];
        let materialMap = {};
        materials.push(new THREE.MeshLambertMaterial( { 
            vertexColors: THREE.VertexColors,
            side: THREE.FrontSide,
            //wireframe: true,
        }));

        // Extract for simpler code
        let vertices = preparedVertices.vertices;
        let geometry = preparedVertices.geometry;

        for (let x = 0; x < wSIZE; x++) {
            for (let y = 0; y < wSIZE; y++) {
                let tile = tiles[x][y];
                //  tile.draw == none -> do not draw this tile
                if (tile.draw == 'none') continue;

                let v00 = vertices[x][y].index;
                let v10 = vertices[x + 1][y].index;
                let v11 = vertices[x + 1][y + 1].index;
                let v01 = vertices[x][y + 1].index;
                
                let vertexColors = this.computeVertexColors(tiles[x][y], tiles[x][y+1], tiles[x+1][y], tiles[x+1][y+1]);

                let face1, face2;
                if (tile.orientation == 'diaga') {
                    face1 = new THREE.Face3(v00,v01,v11);
                    face2 = new THREE.Face3(v00,v11,v10);

                    face1.vertexColors[0] = vertexColors["00"];
                    face1.vertexColors[1] = vertexColors["01"];
                    face1.vertexColors[2] = vertexColors["11"];

                    face2.vertexColors[0] = vertexColors["00"];
                    face2.vertexColors[1] = vertexColors["11"];
                    face2.vertexColors[2] = vertexColors["10"];
                    
                    geometry.faceVertexUvs[0].push(diaga_uvs_0);
                    geometry.faceVertexUvs[0].push(diaga_uvs_1);
                } else {
                    face1 = new THREE.Face3(v00,v01,v10);
                    face2 = new THREE.Face3(v10,v01,v11);
                    
                    face1.vertexColors[0] = vertexColors["00"];
                    face1.vertexColors[1] = vertexColors["01"];
                    face1.vertexColors[2] = vertexColors["10"];

                    face2.vertexColors[0] = vertexColors["10"];
                    face2.vertexColors[1] = vertexColors["01"];
                    face2.vertexColors[2] = vertexColors["11"];

                    geometry.faceVertexUvs[0].push(diagb_uvs_0);
                    geometry.faceVertexUvs[0].push(diagb_uvs_1);
                }

                // Cases:
                //  !tile.secondary == both tiles share the same draw mode

                face1.materialIndex = this.materialIndex(materials, materialMap, 'lambert', tile.texture);
                face2.materialIndex = this.materialIndex(materials, materialMap, 'lambert', (tile.secondary && tile.secondary.texture) || tile.texture);

                geometry.faces.push(face1);
                geometry.faces.push(face2);
            }
        }

        geometry.computeFaceNormals();
        geometry.computeVertexNormals();

        let mesh = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(geometry), materials);
        mesh.matrixAutoUpdate = false;
        return mesh;
    }

    generateWalls(tiles, name, yOff, W) {
        let materials = [];
        let materialMap = {};

        // Precompute the materials and tiles.
        let protofaces = {};
        for (let x = 0; x <= wSIZE; x++) {
            for (let y = 0; y <= wSIZE; y++) {
                let tile = tiles[x][y];
                tile.x = x;
                tile.y = y;
    
                if (!tile.buildings) continue;
                if (!tile.buildings[name]) continue;
    
                if (tile.buildings[name].walls) {
                    for (let i in tile.buildings[name].walls) {
                        let w = tile.buildings[name].walls[i];
                        let p = this.walls[w.type];
    
                        // "color" tiles that need wall vertices defined.
                        if (p && p.type == 'polygon') {
                            if (!protofaces[p.texture]) protofaces[p.texture] = [];
    
                            if (w.position == 'plusx' && x < wSIZE) {
                                protofaces[p.texture].push( [tile, tiles[x+1][y]] );
                            } else if (w.position == 'plusy' && y < wSIZE) {
                                protofaces[p.texture].push( [tile, tiles[x][y+1]] );
                            } else if (w.position == 'diaga' && x < wSIZE && y < wSIZE) {
                                protofaces[p.texture].push( [tile, tiles[x+1][y+1]] );
                            } else if (w.position == 'diagb' && x < wSIZE && y < wSIZE) {
                                protofaces[p.texture].push( [tiles[x+1][y], tiles[x][y+1]] );
                            }
                        }
                    }
                }
            }
        }
    
        // Generate the vertices
        let geometry = new THREE.Geometry();
        let id = 0;
    
        for (let type in protofaces) {
            let pf = protofaces[type];

            let material = this.materialIndex(materials, materialMap, 'basic', type);

            for (let i in pf) {
                let t0 = pf[i][0];
                let t1 = pf[i][1];
    
                geometry.vertices.push(new THREE.Vector3(t0.x, t0.elevation + yOff, t0.y));
                let i1 = id++;
    
                geometry.vertices.push(new THREE.Vector3(t0.x, t0.elevation + yOff + WALL_HEIGHT, t0.y));
                let i2 = id++;
    
                geometry.vertices.push(new THREE.Vector3(t1.x, t1.elevation + yOff, t1.y));
                let i3 = id++;
    
                geometry.vertices.push(new THREE.Vector3(t1.x, t1.elevation + yOff + WALL_HEIGHT, t1.y));
                let i4 = id++;
    
                geometry.faces.push(face(i1, i3, i2, material));
                geometry.faceVertexUvs[0].push(diagb_uvs_0);
    
                geometry.faces.push(face(i4, i3, i2, material));
                geometry.faceVertexUvs[0].push(diagb_uvs_1);
            }
        }

        let mesh = new THREE.Mesh(new THREE.BufferGeometry().fromGeometry(geometry), materials);
        mesh.matrixAutoUpdate = false;
        W.add(mesh);
    }

    isRoof(tile, name) {
        if (!tile.buildings) return false;
        if (!tile.buildings[name]) return false;
        if (tile.buildings[name].roof || tile.buildings[name].walls) return true;
        return false;
    }

    generateRoofs(tiles, name, yOff, W) {
        let materials = [];
        let materialMap = {};

        let geometry = new THREE.Geometry();
        let curId = 0;
        for (let x = 0; x <= wSIZE; x++) {
            for (let y = 0; y <= wSIZE; y++) {
                let tile = tiles[x][y];
                tile.x = x;
                tile.y = y;
    
                if (!tile.buildings) continue;
                if (!tile.buildings[name]) continue;
                if (!tile.buildings[name].roof) continue;
    
                // roof drawing is complicated.
                // this impl is actually broken due to the left edge of the map not knowing about the neighbor
               
                let left = x > 0 ? x - 1 : x;
                let right = x + 1;
                let up = y > 0 ? y - 1 : y;
                let down = y + 1;
    
                let elevated = 0;
    
                let v0; let e0 = false;
                if (this.isRoof(tiles[left][up], name) && this.isRoof(tiles[x][up], name) && this.isRoof(tiles[left][y], name)) {
                    v0 = new THREE.Vector3(x, tile.elevation + yOff + ROOF_HEIGHT, y);
                    elevated++;
                    e0 = true;
                } else {
                    v0 = new THREE.Vector3(x, tile.elevation + yOff, y);
                }
    
                let v1; let e1 = false;
                if (this.isRoof(tiles[right][up], name) && this.isRoof(tiles[x][up], name) && this.isRoof(tiles[right][y], name)) {
                    v1 = new THREE.Vector3(x + 1, tiles[right][y].elevation + yOff + ROOF_HEIGHT, y);
                    elevated++;
                    e1 = true;
                } else {
                    v1 = new THREE.Vector3(x + 1, tiles[right][y].elevation + yOff, y);
                }
    
                let v2; let e2 = false;
                if (this.isRoof(tiles[right][down], name) && this.isRoof(tiles[right][y], name) && this.isRoof(tiles[x][down], name)) {
                    v2 = new THREE.Vector3(x + 1, tiles[right][down].elevation + yOff + ROOF_HEIGHT, y + 1);
                    elevated++;
                    e2 = true;
                } else {
                    v2 = new THREE.Vector3(x + 1, tiles[right][down].elevation + yOff, y + 1);
                }
    
                let v3; let e3 = false;
                if (this.isRoof(tiles[left][down], name) && this.isRoof(tiles[left][y], name) && this.isRoof(tiles[x][down], name)) {
                    v3 = new THREE.Vector3(x, tiles[x][down].elevation + yOff + ROOF_HEIGHT, y + 1);
                    elevated++;
                    e3 = true;
                } else {
                    v3 = new THREE.Vector3(x, tiles[x][down].elevation + yOff, y + 1);
                }
    
                //let geometry = elevated == 4 ? geometries[roofType + '-top'] : geometries[roofType + '-side']
                let tt = this.roofs[tile.buildings[name].roof];
                let materialIndex = this.materialIndex(
                    materials, materialMap, 'basic', 
                    elevated == 4 ? tt.top : tt.side);
    
                geometry.vertices.push(v0);
                let A = curId++;
    
                geometry.vertices.push(v1);
                let B = curId++;
    
                geometry.vertices.push(v2);
                let C = curId++;
    
                geometry.vertices.push(v3);
                let D = curId++;
    
                if (elevated == 0) {
                    // do whatever
                    geometry.faces.push(face(A, B, C, materialIndex));
                    geometry.faceVertexUvs[0].push([u0, u1, u2]);
    
                    geometry.faces.push(face(C, D, A, materialIndex));
                    geometry.faceVertexUvs[0].push([u2, u3, u0]);
                } else if (elevated == 1) {
                    // outer corner
                    if (e0) {
                        geometry.faces.push(face(A, B, C, materialIndex));
                        geometry.faceVertexUvs[0].push([u2, u1, u0]);
    
                        geometry.faces.push(face(C, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u1, u0, u3]);
                    } else if (e1) { 
                        geometry.faces.push(face(B, C, D, materialIndex));
                        geometry.faceVertexUvs[0].push([u2, u1, u0]);
    
                        geometry.faces.push(face(B, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u3, u1, u0]);
                    } else if (e2) {
                        geometry.faces.push(face(A, B, C, materialIndex));
                        geometry.faceVertexUvs[0].push([u0, u1, u2]);
    
                        geometry.faces.push(face(C, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u3, u0, u1]);
                    } else { // e3
                        geometry.faces.push(face(B, C, D, materialIndex));
                        geometry.faceVertexUvs[0].push([u1, u0, u3]);
    
                        geometry.faces.push(face(B, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u0, u2, u1]);
                    }
                } else if (elevated == 2) {
                    if (e0 && e1) {
                        geometry.faces.push(face(A, B, C, materialIndex));
                        geometry.faceVertexUvs[0].push([u3, u2, u1]);
    
                        geometry.faces.push(face(C, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u1, u0, u3]);
                    } else if (e1 && e2) {
                        geometry.faces.push(face(A, B, C, materialIndex));
                        geometry.faceVertexUvs[0].push([u1, u2, u3]);
    
                        geometry.faces.push(face(C, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u3, u0, u1]);
                    } else if (e2 && e3) {
                        geometry.faces.push(face(A, B, C, materialIndex));
                        geometry.faceVertexUvs[0].push([u1, u0, u3]);
    
                        geometry.faces.push(face(C, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u3, u2, u1]);
                    } else if (e3 && e0) {
                        geometry.faces.push(face(A, B, C, materialIndex));
                        geometry.faceVertexUvs[0].push([u3, u0, u1]);
    
                        geometry.faces.push(face(C, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u1, u2, u3]);
                    } else if (e0 && e2) {
                        console.log("Have not implemented roofs at " + x + "," + y);
                    } else if (e1 && e3) {
                        console.log("Have not implemented roofs at " + x + "," + y);
                    } else {
                        console.log("Weird roofs at " + x + "," + y);
                    }
    
                } else if (elevated == 3) {
                    if (!e0) {
                        geometry.faces.push(face(A, B, C, materialIndex));
                        geometry.faceVertexUvs[0].push([u1, u2, u3]);
    
                        geometry.faces.push(face(C, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u2, u3, u0]);
                    } else if (!e1) {
                        geometry.faces.push(face(B, C, D, materialIndex));
                        geometry.faceVertexUvs[0].push([u1, u2, u3]);
    
                        geometry.faces.push(face(B, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u0, u2, u3]);
                    } else if (!e2) {
                        geometry.faces.push(face(A, B, C, materialIndex));
                        geometry.faceVertexUvs[0].push([u3, u2, u1]);
    
                        geometry.faces.push(face(C, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u0, u3, u2]);
                    } else if (!e3) {
                        geometry.faces.push(face(B, C, D, materialIndex));
                        geometry.faceVertexUvs[0].push([u2, u3, u0]);
    
                        geometry.faces.push(face(B, D, A, materialIndex));
                        geometry.faceVertexUvs[0].push([u3, u1, u2]);
                    }
                } else {
                    // do whatever
                    geometry.faces.push(face(A, B, C, materialIndex));
                    geometry.faceVertexUvs[0].push([u0, u1, u2]);
    
                    geometry.faces.push(face(C, D, A, materialIndex));
                    geometry.faceVertexUvs[0].push([u2, u3, u0]);
                }
            }
        }

        let mesh = new THREE.Mesh(geometry, materials);
        mesh.matrixAutoUpdate = false;
        W.add(mesh);
    }

    generateLevel(tiles, level, group) {
        let name = "level" + level; // 0-3
        let yOff = level * WALL_HEIGHT;
    
        this.generateWalls(tiles, name, yOff, group);
        this.generateRoofs(tiles, name, yOff, group);
    }

    // Creates the level meshes in the walls and roofs groups.
    // Wall group always visible, while roofs disappear/fade when you're indoors.
    generateBuildings(tiles, W, R) {
        this.generateLevel(tiles, 0, W);

        this.generateLevel(tiles, 1, R);
        this.generateLevel(tiles, 2, R);
        this.generateLevel(tiles, 3, R);
    }

    createMesh(params, mesh) {
        if (!this.textureManager) throw "Texture manager missing."
        if (!this.walls) throw "Wall definitions missing."
        if (!this.roofs) throw "Roof definitions missing."

        let preparedVertices = this.prepareVertices(mesh);
        let threeMesh = this.populateGeometry(mesh, preparedVertices);

        let walls = new THREE.Group();
        let roofs = new THREE.Group();
        this.generateBuildings(mesh, walls, roofs);

        if (params.offset) {
            let x = params.offset.mx * wSIZE;
            let z = params.offset.my * wSIZE;
            let k = params.offset.mx + "," + params.offset.my;
            threeMesh.name = "mesh-" + k;
            threeMesh.position.set(x, 0, z);
            threeMesh.updateMatrix();

            walls.position.set(x, 0, z);
            walls.name = "walls-" + k;
            walls.updateMatrix();

            roofs.position.set(x, 0, z);
            roofs.name = "roofs-" + k;
            roofs.updateMatrix();
        }

        return {
            terrain: new TerrainMesh(params, mesh, threeMesh, walls, roofs)
        }
    }
}

/*function exportCollada(mesh, name) {
    var exporter = new THREE.ColladaExporter();

    var { data, textures } = exporter.parse(mesh);

    const zip = new JSZip();
    zip.file( 'myCollada.dae', data );
    textures.forEach( tex => zip.file( `textures/${ tex.name }.${ tex.ext }`, tex.data ) );
    
    zip.generateAsync({type:"blob"}).then((blob) => {
        saveAs(blob, "hello.zip");
    }, (err) => {
        console.log(":(> " + err);
    })
}*/