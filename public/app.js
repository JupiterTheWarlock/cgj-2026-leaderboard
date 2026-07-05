const REFRESH_INTERVAL_MS = 7000;
const SCORE_UNITS = ["", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

const state = {
  page: 1,
  pageSize: 20,
  sort: "score",
  order: "desc",
  q: "",
  total: 0,
  loading: false
};

const els = {
  rows: document.querySelector("#scoreRows"),
  status: document.querySelector("#statusText"),
  total: document.querySelector("#totalText"),
  page: document.querySelector("#pageText"),
  search: document.querySelector("#searchInput"),
  sort: document.querySelector("#sortSelect"),
  order: document.querySelector("#orderSelect"),
  pageSize: document.querySelector("#pageSizeSelect"),
  admin: document.querySelector("#adminInput"),
  refresh: document.querySelector("#refreshBtn"),
  prev: document.querySelector("#prevBtn"),
  next: document.querySelector("#nextBtn")
};

els.refresh.addEventListener("click", loadScores);
els.prev.addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    loadScores();
  }
});
els.next.addEventListener("click", () => {
  if (state.page * state.pageSize < state.total) {
    state.page += 1;
    loadScores();
  }
});
els.sort.addEventListener("change", () => updateFilter("sort", els.sort.value));
els.order.addEventListener("change", () => updateFilter("order", els.order.value));
els.pageSize.addEventListener("change", () => updateFilter("pageSize", Number(els.pageSize.value)));
els.search.addEventListener("input", debounce(() => updateFilter("q", els.search.value.trim()), 220));
els.admin.addEventListener("input", () => document.body.classList.toggle("admin-on", Boolean(els.admin.value)));

loadScores();
setInterval(() => {
  if (!document.hidden) loadScores();
}, REFRESH_INTERVAL_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadScores();
});
bootBackground();

function updateFilter(key, value) {
  state[key] = value;
  state.page = 1;
  loadScores();
}

async function loadScores() {
  state.loading = true;
  renderPager();
  els.status.textContent = "正在加载成绩...";

  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
    sort: state.sort,
    order: state.order
  });
  if (state.q) params.set("q", state.q);

  try {
    const response = await fetch(`/api/scores?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(localizeError(data.error) || "加载成绩失败");
    state.total = data.total;
    renderRows(data.items);
    els.status.textContent = data.items.length ? `已同步 ${formatClock(new Date())}` : "暂无成绩";
    els.total.textContent = `共 ${data.total} 条`;
  } catch (error) {
    els.status.textContent = error.message;
    els.total.textContent = "";
    els.rows.innerHTML = "";
  } finally {
    state.loading = false;
    renderPager();
  }
}

function renderRows(items) {
  els.rows.innerHTML = items.map((item, index) => {
    const rank = (state.page - 1) * state.pageSize + index + 1;
    return `
      <tr>
        <td class="rank">#${rank}</td>
        <td>${escapeHtml(item.playerName)}</td>
        <td class="score">${formatScore(item.score)}</td>
        <td>${formatDate(item.createdAt)}</td>
        <td>${formatDuration(item.durationMs)}</td>
        <td class="admin-cell"><button class="delete-btn" type="button" data-id="${item.id}">删除</button></td>
      </tr>
    `;
  }).join("");

  for (const button of els.rows.querySelectorAll(".delete-btn")) {
    button.addEventListener("click", () => deleteScore(button.dataset.id));
  }
}

async function deleteScore(id) {
  if (!els.admin.value) return;
  if (!confirm("删除这条成绩？")) return;

  const response = await fetch(`/api/scores/${id}`, {
    method: "DELETE",
    headers: { "x-admin-password": els.admin.value }
  });
  const data = await response.json();
  if (!response.ok) {
    alert(localizeError(data.error) || "删除失败");
    return;
  }
  loadScores();
}

function renderPager() {
  els.page.textContent = `第 ${state.page} 页`;
  els.prev.disabled = state.loading || state.page <= 1;
  els.next.disabled = state.loading || state.page * state.pageSize >= state.total;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(Number(ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1_000_000) return value.toLocaleString();

  const tier = Math.min(Math.floor(Math.log10(Math.abs(value)) / 3) - 1, SCORE_UNITS.length - 1);
  const scaled = value / (1000 ** (tier + 1));
  return `${trimDecimals(scaled)}${SCORE_UNITS[tier]}`;
}

function trimDecimals(value) {
  return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatClock(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(value);
}

function localizeError(error) {
  return ({
    "bad admin password": "管理员密码错误",
    "bad api password": "上传密码错误",
    "not found": "未找到记录",
    "server error": "服务器错误",
    "guid is required": "缺少提交编号",
    "guid is invalid": "提交编号格式错误",
    "playerName is required": "缺少玩家名",
    "playerName must be 1-24 characters": "玩家名需为 1-24 个字符",
    "score is required": "缺少分数",
    "score is invalid": "分数格式错误",
    "durationMs is required": "缺少单局时长",
    "durationMs is invalid": "单局时长格式错误"
  })[error];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function debounce(fn, delay) {
  let timer = 0;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}

function bootBackground() {
  const canvas = document.querySelector("#spaceCanvas");
  const gl = canvas.getContext("webgl", { antialias: false, depth: false, stencil: false });
  if (!gl) return;

  const source = document.createElement("canvas");
  const sourceCtx = source.getContext("2d");
  const texture = gl.createTexture();
  const program = makeProgram(gl);
  const images = ["/assets/backgrounds/5.png", "/assets/backgrounds/7.png", "/assets/backgrounds/10.png"].map((src) => {
    const image = new Image();
    image.src = src;
    return image;
  });

  const pos = gl.getAttribLocation(program, "a_pos");
  const time = gl.getUniformLocation(program, "u_time");
  const resolution = gl.getUniformLocation(program, "u_resolution");
  const sampler = gl.getUniformLocation(program, "u_tex");
  const buffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  function draw(now) {
    resizeCanvas(canvas);
    source.width = canvas.width;
    source.height = canvas.height;
    sourceCtx.fillStyle = "#000";
    sourceCtx.fillRect(0, 0, source.width, source.height);

    const tile = Math.max(source.height, 720);
    const offset = (now * 0.018) % tile;
    for (let i = -1; i < Math.ceil(source.width / tile) + 2; i += 1) {
      const image = images[Math.abs(i) % images.length];
      if (image.complete) {
        sourceCtx.drawImage(image, i * tile - offset, (source.height - tile) * 0.5, tile, tile);
      }
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.useProgram(program);
    gl.enableVertexAttribArray(pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(time, now * 0.001);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1i(sampler, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
}

function resizeCanvas(canvas) {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(canvas.clientWidth * scale);
  const height = Math.floor(canvas.clientHeight * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function makeProgram(gl) {
  const vertex = compile(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = a_pos * 0.5 + 0.5;
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform sampler2D u_tex;
    uniform vec2 u_resolution;
    uniform float u_time;
    varying vec2 v_uv;
    void main() {
      vec2 uv = v_uv;
      vec2 p = uv * 2.0 - 1.0;
      p.x *= u_resolution.x / u_resolution.y;
      float r2 = dot(p, p);
      vec2 warp = (uv - 0.5) * (1.0 + r2 * 0.12) + 0.5;
      vec4 col = texture2D(u_tex, warp);
      float scan = sin((uv.y + u_time * 0.012) * 720.0 * 3.14159265) * 0.5 + 0.5;
      col.rgb *= 0.72 + scan * 0.22;
      col.rgb *= smoothstep(1.35, 0.25, r2);
      gl_FragColor = vec4(col.rgb, 1.0);
    }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return program;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}
