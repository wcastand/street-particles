import qs from 'https://cdn.skypack.dev/qs'

const loading = document.querySelector('.loader')
const search = document.querySelector('#query')
const form = document.querySelector('#form')
const selectform = document.querySelector('#getdata')
const select = document.querySelector('#select')
const canvas = document.querySelector('#canvas')
const ctx = canvas.getContext('2d')

function getBoundingBox(nodes) {
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	for (let [x, y] of nodes) {
		if (x < minX) minX = x
		else if (x > maxX) maxX = x
		if (y < minY) minY = y
		else if (y > maxY) maxY = y
	}

	const width = Math.abs(maxX - minX)
	const height = Math.abs(maxY - minY)
	return { left: minX, right: maxX, top: minY, bottom: maxY, width, height, ratio: height / width }
}

function getCenter(nodes) {
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	for (let n of nodes) {
		const lon = n.lon
		const lat = n.lat
		if (lon < minX) minX = lon
		else if (lon > maxX) maxX = lon
		if (lat < minY) minY = lat
		else if (lat > maxY) maxY = lat
	}

	return [(minX + maxX) / 2, (minY + maxY) / 2]
}

function shiftBox(box, nodes) {
	const bounds = {
		left: box.left - box.left,
		right: box.right - box.left,
		top: box.top - box.top,
		bottom: box.bottom - box.top,
		width: box.width,
		height: box.height,
		ratio: box.ratio,
	}
	let points = new Map()
	for (let [k, n] of nodes.entries()) points.set(k, [n[0] - box.left, box.bottom + n[1]])
	return [bounds, points]
}
function setStrokeWidth(way, ctx) {
	const highway = way.tags.highway
	if (highway === 'primary') ctx.lineWidth = 5
	else if (highway === 'secondary') ctx.lineWidth = 3
	else ctx.lineWidth = 1
}

function drawMap(data) {
	const [nodes, ways] = data.elements.reduce(
		([nodes, ways], n) => (n.type === 'node' ? [nodes.concat([n]), ways] : [nodes, ways.concat([n])]),
		[[], []]
	)
	let points = new Map()
	const center = getCenter(nodes)
	const projection = d3.geoMercator().center(center).scale(6371393) // Radius of Earth
	for (let n of nodes) points.set(n.id, projection([n.lon, n.lat]))
	const box = getBoundingBox(points.values())
	const [bounds, cloud] = shiftBox(box, points)

	let w, h
	if (bounds.width < bounds.height) {
		w = 512
		h = w * bounds.ratio
	} else {
		h = 512
		w = h / bounds.ratio
	}
	const rx = w / bounds.width
	const ry = h / bounds.height

	canvas.width = w
	canvas.height = h
	ctx.fillStyle = '#fff'
	ctx.rect(0, 0, w, h)
	ctx.fill()

	for (let w of ways) {
		const lines = w.nodes.map((id) => cloud.get(id))
		ctx.strokeStyle = '#25232D'
		setStrokeWidth(w, ctx)
		ctx.beginPath()
		ctx.moveTo(lines[0][0] * rx, lines[(0)[1]] * ry)
		for (let [x, y] of lines) ctx.lineTo(x * rx, y * ry)
		ctx.stroke()
		ctx.closePath()
	}
}

let searchResult = []

function updateSelect() {
	const nodes = select.querySelectorAll('option')
	for (let node of nodes) select.removeChild(node)

	const defaultValue = document.createElement('option')
	defaultValue.value = -1
	defaultValue.innerHTML = 'Select a town'
	defaultValue.disabled = true
	defaultValue.selected = true
	select.appendChild(defaultValue)

	for (let res of searchResult) {
		const opt = document.createElement('option')
		opt.value = res.osm_id
		opt.innerHTML = res.display_name
		select.appendChild(opt)
	}
}
form.addEventListener('submit', (ev) => {
	const uri = 'https://nominatim.openstreetmap.org/search?format=json&q='
	fetch(uri + encodeURIComponent(search.value))
		.then((res) => res.json())
		.then((json) => {
			searchResult = json
			updateSelect()
		})
	ev.preventDefault()
	ev.stopPropagation()
	return false
})

selectform.addEventListener('submit', (ev) => {
	const node = searchResult[select.options.selectedIndex - 1]
	const id = node.osm_id + 3600000000
	getData(id).then((data) => drawMap(data))
	ev.preventDefault()
	ev.stopPropagation()
	return false
})

async function getData(position) {
	const query = `[out:json][timeout:25];
	area(id:${position})[admin_level=8];
	way(area)[highway~"^(((motorway|trunk|primary|secondary|tertiary)(_link)?)|unclassified|residential|living_street|pedestrian|service|track)$"][area!=yes];
	(._;>;);
	out;`

	const reqOptions = {
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: qs.stringify({ data: query }),
	}
	loading.style.display = 'block'
	const res = await fetch('https://lz4.overpass-api.de/api/interpreter', { method: 'POST', ...reqOptions })
		.then((res) => res.json())
		.then((json) => json)
		.catch((err) => console.error(err))
	loading.style.display = 'none'
	return res
}
