
document.addEventListener("DOMContentLoaded", (async function () {
    const webcameVideo = document.getElementById("webcam");
    const backgroundCanvas = document.getElementById("background");
    const compositeCanvas = document.getElementById("composite");
    const backgroundContext = backgroundCanvas.getContext("2d");
    const compositeContext = compositeCanvas.getContext("2d");
    const maskCanvas = document.createElement("canvas");
    const maskContext = maskCanvas.getContext("2d");

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        webcameVideo.srcObject = stream;
    } catch (err) {
        alert("Camera access failed: " + err.message);
        return;
    }

    function fitCanvases() {
        const width = webcameVideo.videoWidth || 1280;
        const height = webcameVideo.videoHeight || 720;
        [backgroundCanvas, compositeCanvas, maskCanvas].forEach(context => { context.width = width; context.height = height; });
    }

    await new Promise(fn => webcameVideo.onloadedmetadata = fn);
    fitCanvases();

    const roughCanvas = rough.canvas(backgroundCanvas);

    const IDEA_DOT_COLOR = "#7A1FF0";
    const EXECUTION_DOT_COLOR = "#D6D12A";
    const BG_MARGIN = Math.round(backgroundCanvas.width * 0.06);
    const GRID_W = backgroundCanvas.width - BG_MARGIN * 2;
    const GRID_H = backgroundCanvas.height - BG_MARGIN * 1.6;
    const DOT_R = Math.max(6, Math.round(Math.min(backgroundCanvas.width, backgroundCanvas.height) * 0.013));
    const COLS = Math.floor(GRID_W / (DOT_R * 2.4));
    const ROWS = Math.floor(GRID_H / (DOT_R * 2.4));
    const X_STEP = GRID_W / (COLS - 1);
    const Y_STEP = GRID_H / (ROWS - 1);

    const points = [];
    for (let rowIndex = 0; rowIndex < ROWS; rowIndex++) {
        for (let columnIndex = 0; columnIndex < COLS; columnIndex++) {
            const x = BG_MARGIN + columnIndex * X_STEP;
            const y = BG_MARGIN + rowIndex * Y_STEP;
            points.push({ x, y });
        }
    }
    const specialIndex = Math.floor(Math.random() * points.length);

    const selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
    });
    selfieSegmentation.setOptions({ modelSelection: 1 });

    let latestMaskImage = null;
    selfieSegmentation.onResults((results) => {
        maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        maskContext.drawImage(results.segmentationMask, 0, 0, maskCanvas.width, maskCanvas.height);
        latestMaskImage = true;
    });
    async function pumpSegmentation() {
        if (webcameVideo.readyState >= 2) {
            await selfieSegmentation.send({ image: webcameVideo });
        }
        requestAnimationFrame(pumpSegmentation);
    }
    pumpSegmentation();
    function draw() {
        backgroundContext.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
        const maskData = latestMaskImage ? maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height) : null;
        const mW = maskCanvas.width, mH = maskCanvas.height;

        function sampleMask(x, y) {
            if (!maskData) return 0;
            const ix = Math.max(0, Math.min(mW - 1, x | 0));
            const iy = Math.max(0, Math.min(mH - 1, y | 0));
            const idx = (iy * mW + ix) * 4 + 3;
            return maskData.data[idx] / 255;
        }

        points.forEach((point, idx) => {
            let x = point.x, y = point.y;

            let inside = false;
            if (maskData) {
                const MmaskSample = sampleMask(x, y) > 0.5;
                inside = MmaskSample;
                if (MmaskSample) {
                    const gx = sampleMask(x + 2, y) - sampleMask(x - 2, y);
                    const gy = sampleMask(x, y + 2) - sampleMask(x, y - 2);
                    const len = Math.hypot(gx, gy) || 1;
                    const PUSH = DOT_R * 1.6;
                    x += (-gx / len) * PUSH;
                    y += (-gy / len) * PUSH;
                }
            }

            const color = (idx === specialIndex) ? EXECUTION_DOT_COLOR : IDEA_DOT_COLOR;
            const options = {
                fill: color,
                fillStyle: "solid",
                stroke: color,
                roughness: 0.8
            };

            if (!inside || sampleMask(x, y) < 0.45) {
                roughCanvas.circle(x, y, DOT_R * 2, { ...point.options, ...options });
            }
        });

        if (latestMaskImage) {
            compositeContext.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);

            compositeContext.save();
            compositeContext.drawImage(maskCanvas, 0, 0);
            compositeContext.globalCompositeOperation = "source-in";
            compositeContext.drawImage(webcameVideo, 0, 0, compositeCanvas.width, compositeCanvas.height);
            compositeContext.restore();
        }

        requestAnimationFrame(draw);
    }
    draw();

    window.addEventListener("resize", () => {
        fitCanvases();
    });
}
));