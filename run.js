var express = require('express');
var http = require('http');
var path = require('path');

var api = require('./scripts/editor/api.js');

const PORT = 7500;

var app = express();
app.set('port', PORT);

app.use(express.json());
app.use(express.static(path.join(__dirname,'../editor')));
app.use('/',express.static(path.join(__dirname,'scene')));
app.use('/play/',express.static(path.join(__dirname,'play')));
app.use('/static/',express.static(path.join(__dirname,'static')));

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, '/editor/scene.html'));
});

let r = express.Router();
r.get('/world', (req, res) => {
    res.send(
        JSON.stringify(
            api.getWorldMetadata(req.query)));
})

r.get('/walls', (req, res) => {
    res.sendFile(path.join(__dirname, './data/walls.json'));
})
r.get('/roofs', (req, res) => {
    res.sendFile(path.join(__dirname, './data/roofs.json'));
})
r.get('/models', (req, res) => {
    res.sendFile(path.join(__dirname, './data/models.json'));
})

r.get('/world/:layer/:x/:y', (req, res) => {
    let params = Object.assign({}, req.query, { root: './data/maps/'});
    res.send(
        JSON.stringify(
            api.getWorldInfo(req.params.layer, req.params.x, req.params.y, params)));
})
r.get('/world/:layer/:x/:y/mesh', async (req, res) => {
    let params = Object.assign({}, req.query, { root: './data/maps/'});
    res.send(
        JSON.stringify(
            await api.getWorldMesh(req.params.layer, req.params.x, req.params.y, params)));
})
r.get('/world/:layer/:x/:y/scenery', (req, res) => {

    let params = Object.assign({}, req.query, {root:"./data/maps/"});

    res.send(
        JSON.stringify(
            api.getWorldObjects(req.params.layer, req.params.x, req.params.y, params)));
})
app.use('/api', r);

var server = http.Server(app);
server.listen(PORT, function() {
    console.log('Starting server on port ' + PORT);
});