import './styles.css';

const WEBSOCKET_URI = "ws://172.16.100.15:8005";
// 使用一个已经确认可以播放的音频文件（或者你可以提供一个可以播放的音频文件，我来确认）
const connectButton = document.getElementById('connectButton');
const statusDiv = document.getElementById('status');
let ws;
let audioContext;
let stream;

// 播放音频函数（改为使用 Audio 对象）
function playAudio() {
    const audioElement = document.getElementById('responseAudio');

    // 重置音频到开始位置
    audioElement.currentTime = 0;

    audioElement.play()
        .then(() => {
            console.log("Audio playback started successfully");
            statusDiv.innerHTML += "Audio playback started...<br>";
            // 监听播放结束事件
            audioElement.onended = () => {
                statusDiv.innerHTML += "Listening for next wake word...<br>";
            };
        })
        .catch((error) => {
            console.error("Error playing audio:", error);
            statusDiv.innerHTML += "Error playing audio: " + error + "<br>";
        });
}

let last_result = ""; // 移到函数外部

function handleKWSResponse(message) {
    try {
        const json_message = JSON.parse(message);
        console.log('json_message', json_message);
        const code = json_message.code;
        const keyword = json_message.keyword || "";
        const message_text = json_message.message || "";

        if (code === 200 && keyword) {
            // 检测到关键词
            statusDiv.innerHTML += `<strong>Detected: ${keyword}, message: ${message_text}</strong><br>`;
            playAudio();
            // 延迟重置 last_result，给音频播放一些时间
            setTimeout(() => {
                last_result = "";
            }, 3000); // 3秒后重置，可以根据实际需要调整时间
        } else {
            // 未检测到关键词，保持向下滚动效果
            statusDiv.innerHTML += `${message_text}<br>`; // 添加换行符实现向下滚动

            // 限制显示的行数，避免内容过多
            const maxLines = 20; // 可以根据需要调整行数
            const lines = statusDiv.innerHTML.split('<br>');
            if (lines.length > maxLines) {
                statusDiv.innerHTML = lines.slice(-maxLines).join('<br>');
            }
        }

        // 自动滚动到底部
        statusDiv.scrollTop = statusDiv.scrollHeight;
    } catch (error) {
        console.error("Failed to decode JSON or other error:", error);
        statusDiv.innerHTML += "Failed to decode JSON or other error: " + error + "<br>";
    }
}

async function startListening() {
    statusDiv.innerHTML = "Connecting...<br>";
    try {
        ws = new WebSocket(WEBSOCKET_URI);

        ws.onopen = async () => {
            statusDiv.innerHTML += "Connected. Listening...<br>";
            connectButton.textContent = "Disconnect";

            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new AudioContext({ sampleRate: 16000 });
            const source = audioContext.createMediaStreamSource(stream);

            // 使用 ScriptProcessorNode 处理音频数据
            const processor = audioContext.createScriptProcessor(4096, 1, 1);

            source.connect(processor);
            processor.connect(audioContext.destination);

            processor.onaudioprocess = (audioProcessingEvent) => {
                if (ws.readyState === WebSocket.OPEN) {
                    const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                    const buffer = new ArrayBuffer(inputData.length * 4);
                    const view = new DataView(buffer);
                    for (let i = 0; i < inputData.length; i++) {
                        view.setFloat32(i * 4, inputData[i], true);
                    }
                    ws.send(buffer);
                }
            };
        };

        ws.onmessage = (event) => handleKWSResponse(event.data);

        ws.onerror = (error) => {
            statusDiv.innerHTML += "WebSocket Error: " + error + "<br>";
            console.error("WebSocket Error:", error);
        };

        ws.onclose = () => {
            statusDiv.innerHTML += "Disconnected.<br>";
            connectButton.textContent = "Connect and Start Listening";
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            if (audioContext) {
                audioContext.close();
                audioContext = null;
            }
        };
    } catch (error) {
        statusDiv.innerHTML += "Error: " + error + "<br>";
        console.error("Error:", error);
    }
}

connectButton.addEventListener('click', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        startListening();
    } else {
        ws.close();
    }
});