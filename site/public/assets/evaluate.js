(function () {
  "use strict";

  var UPLOAD_CONFIG = {
    plan: { accept: ".md,.txt,.markdown", extensions: ["md", "txt", "markdown"] },
  };

  var EVALUATE_TIMEOUT_MS = 180000;

  var cards = document.querySelectorAll("[data-upload-card]");
  var submitBtn = document.getElementById("evaluate-submit");
  var resultsPanel = document.getElementById("results-panel");
  var errorBanner = document.getElementById("evaluate-error");
  var repoUrlInput = document.getElementById("repo-url-input");

  if (!cards.length || !submitBtn || !resultsPanel || !repoUrlInput) {
    return;
  }

  function hideError() {
    if (errorBanner) {
      errorBanner.classList.add("hidden");
      errorBanner.textContent = "";
    }
  }

  function showError(message) {
    if (!errorBanner) {
      window.alert(message);
      return;
    }
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
    errorBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showVoiceInfo(message) {
    var notice = document.getElementById("voice-notice");
    if (!notice) {
      return;
    }
    notice.textContent = message;
    notice.classList.remove("hidden");
  }

  function hideVoiceInfo() {
    var notice = document.getElementById("voice-notice");
    if (notice) {
      notice.textContent = "";
      notice.classList.add("hidden");
    }
  }

  function formatApiError(payload, fallback) {
    if (!payload || payload.detail === undefined || payload.detail === null) {
      return fallback;
    }
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
    if (Array.isArray(payload.detail)) {
      return payload.detail
        .map(function (item) {
          if (typeof item === "string") {
            return item;
          }
          if (item && item.msg) {
            return item.msg;
          }
          return fallback;
        })
        .join(" ");
    }
    return String(payload.detail);
  }

  function getExtension(name) {
    var parts = name.split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stripBom(text) {
    if (text && text.charCodeAt(0) === 0xfeff) {
      return text.slice(1);
    }
    return text;
  }

  function normalizeGithubUrl(url) {
    var trimmed = (url || "").trim();
    if (!trimmed) {
      return "";
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      return "https://" + trimmed;
    }
    return trimmed;
  }

  function isValidGithubRepoUrl(url) {
    try {
      var parsed = new URL(url);
      var host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      if (host !== "github.com") {
        return false;
      }
      var parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts.length < 2) {
        return false;
      }
      return /^[A-Za-z0-9_.-]+$/.test(parts[0]) && /^[A-Za-z0-9_.-]+$/.test(parts[1]);
    } catch (err) {
      return false;
    }
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, timeoutMs);
    var merged = Object.assign({}, options || {}, { signal: controller.signal });
    return fetch(url, merged).finally(function () {
      clearTimeout(timer);
    });
  }

  function validateEvaluateResponse(data) {
    if (!data || typeof data !== "object") {
      throw new Error("심사 응답 형식이 올바르지 않습니다.");
    }
    var requiredNumbers = [
      "total_score",
      "public_sector_score",
      "intent_implementation_score",
      "readme_quality_score",
    ];
    for (var i = 0; i < requiredNumbers.length; i += 1) {
      if (typeof data[requiredNumbers[i]] !== "number") {
        throw new Error("심사 응답에 점수 정보가 누락되었습니다.");
      }
    }
    if (!Array.isArray(data.strengths) || !Array.isArray(data.risks)) {
      throw new Error("심사 응답에 평가 후기가 누락되었습니다.");
    }
    if (!data.final_verdict || !Array.isArray(data.domain_summary_rows)) {
      throw new Error("심사 응답이 불완전합니다. 다시 시도해 주세요.");
    }
    return data;
  }

  function initUploadCard(card) {
    var key = card.getAttribute("data-upload-card");
    var config = UPLOAD_CONFIG[key];
    var storedContent = "";

    if (!config) {
      return function () {
        return "";
      };
    }

    var dropZone = card.querySelector("[data-dropzone]");
    var fileInput = card.querySelector("[data-file-input]");
    var placeholder = card.querySelector("[data-upload-placeholder]");
    var fileNameEl = card.querySelector("[data-filename]");

    if (!dropZone || !fileInput) {
      return function () {
        return "";
      };
    }

    fileInput.setAttribute("accept", config.accept);

    function setUploaded(name) {
      if (name) {
        if (fileNameEl) {
          fileNameEl.innerHTML =
            '<span class="material-symbols-outlined">draft</span>' +
            '<span class="font-label-md text-label-md text-on-surface">' +
            escapeHtml(name) +
            "</span>";
          fileNameEl.classList.remove("hidden");
        }
        if (placeholder) {
          placeholder.classList.add("hidden");
        }
        dropZone.classList.add("upload-dropzone--filled");
      } else {
        storedContent = "";
        if (fileNameEl) {
          fileNameEl.innerHTML = "";
          fileNameEl.classList.add("hidden");
        }
        if (placeholder) {
          placeholder.classList.remove("hidden");
        }
        dropZone.classList.remove("upload-dropzone--filled");
      }
    }

    function loadFile(file) {
      if (!file) {
        return Promise.resolve();
      }

      var ext = getExtension(file.name);
      if (config.extensions.indexOf(ext) === -1) {
        showError(
          "지원하지 않는 파일 형식입니다 (" +
            file.name +
            "). 허용: " +
            config.extensions.join(", ")
        );
        return Promise.resolve();
      }

      if (file.size > 50 * 1024 * 1024) {
        showError("50MB 이하 파일만 업로드할 수 있습니다.");
        return Promise.resolve();
      }

      hideError();
      return file
        .text()
        .then(function (text) {
          storedContent = stripBom(text);
          setUploaded(file.name);
        })
        .catch(function () {
          showError("파일을 읽을 수 없습니다: " + file.name);
        });
    }

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      loadFile(file).finally(function () {
        fileInput.value = "";
      });
    });

    ["dragenter", "dragover"].forEach(function (eventName) {
      dropZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.add("upload-dropzone--drag");
      });
    });

    ["dragleave", "drop"].forEach(function (eventName) {
      dropZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove("upload-dropzone--drag");
      });
    });

    dropZone.addEventListener("drop", function (event) {
      var file = event.dataTransfer && event.dataTransfer.files[0];
      loadFile(file);
    });

    return function () {
      return storedContent.trim();
    };
  }

  var gettersByKey = {};
  cards.forEach(function (card) {
    var key = card.getAttribute("data-upload-card");
    if (key) {
      gettersByKey[key] = initUploadCard(card);
    }
  });

  fetch("/api/health")
    .then(function (response) {
      if (!response.ok) {
        throw new Error("health");
      }
      return response.json();
    })
    .catch(function () {
      showError(
        "API 서버에 연결할 수 없습니다. 프로젝트 폴더에서 uvicorn api:app --host 127.0.0.1 --port 8080 으로 서버를 실행해 주세요."
      );
    });

  function renderVerdict(lines) {
    if (!lines.length) {
      return (
        '<div class="result-verdict-grand">' +
        '<div class="result-verdict-grand__glow"></div>' +
        '<div class="result-verdict-grand__inner">' +
        '<div class="result-verdict-grand__badge">' +
        '<span class="material-symbols-outlined">gavel</span>최종 한마디</div>' +
        '<p class="result-verdict-lead">심사 결과 요약이 준비되지 않았습니다.</p>' +
        "</div></div>"
      );
    }

    var lead =
      '<p class="result-verdict-lead">' + escapeHtml(lines[0]) + "</p>";
    var rest = lines
      .slice(1)
      .map(function (line) {
        return (
          '<p class="result-verdict-line">' + escapeHtml(line.trim()) + "</p>"
        );
      })
      .join("");

    return (
      '<div class="result-verdict-grand">' +
      '<div class="result-verdict-grand__glow"></div>' +
      '<div class="result-verdict-grand__inner">' +
      '<div class="result-verdict-grand__badge">' +
      '<span class="material-symbols-outlined">gavel</span>최종 한마디</div>' +
      '<div class="result-verdict-grand__body">' +
      lead +
      rest +
      "</div></div></div>"
    );
  }

  var activeVoiceSession = null;
  var activeVoiceAudio = null;

  function buildVoiceSegmentsFallback(data) {
    return [
      {
        id: "score",
        label: "종합 점수",
        icon: "leaderboard",
        text:
          "안녕하세요, AI 심사위원입니다. " +
          "이번 심사 결과를 말씀드릴게요. " +
          "종합 점수는 " +
          data.total_score +
          "점이고, " +
          "공공기관 적합성 " +
          data.public_sector_score +
          "점, " +
          "의도 구현도 " +
          data.intent_implementation_score +
          "점, " +
          "README 품질 " +
          data.readme_quality_score +
          "점입니다.",
      },
      {
        id: "verdict",
        label: "최종 평가",
        icon: "gavel",
        text:
          "마지막으로 드리는 말씀입니다. " +
          (data.final_verdict || "").trim().replace(/\s+/g, " ") +
          " 오늘도 수고 많으셨습니다.",
      },
    ];
  }

  function fetchVoiceNarration(data) {
    return fetch("/api/narration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total_score: data.total_score,
        public_sector_score: data.public_sector_score,
        intent_implementation_score: data.intent_implementation_score,
        readme_quality_score: data.readme_quality_score,
        strengths: data.strengths,
        risks: data.risks,
        final_verdict: data.final_verdict,
      }),
    }).then(function (response) {
      if (!response.ok) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (payload) {
            throw new Error(
              formatApiError(payload, "음성 대본 생성에 실패했습니다.")
            );
          });
      }
      return response.json();
    });
  }

  function setAuroraOverlay(active, paused) {
    var overlay = document.getElementById("voice-aurora-overlay");
    if (overlay) {
      overlay.classList.toggle("voice-aurora-overlay--active", active);
      overlay.classList.toggle("voice-aurora-overlay--paused", !!paused);
      overlay.setAttribute("aria-hidden", active ? "false" : "true");
    }
  }

  function fetchTtsAudio(text) {
    return fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text }),
    }).then(function (response) {
      if (!response.ok) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (payload) {
            throw new Error(
              formatApiError(payload, "음성 생성에 실패했습니다.")
            );
          });
      }
      return response.blob();
    });
  }

  function playAudioBlob(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var audio = new Audio(url);
      activeVoiceAudio = audio;

      function finish() {
        URL.revokeObjectURL(url);
        if (activeVoiceAudio === audio) {
          activeVoiceAudio = null;
        }
      }

      audio.onended = function () {
        finish();
        resolve({ completed: true });
      };
      audio.onerror = function () {
        finish();
        reject(new Error("audio playback failed"));
      };
      audio.play().catch(reject);
    });
  }

  function speakWithBrowser(text) {
    return new Promise(function (resolve, reject) {
      if (!window.speechSynthesis) {
        reject(new Error("no speech synthesis"));
        return;
      }
      var utter = new SpeechSynthesisUtterance(text);
      utter.lang = "ko-KR";
      utter.rate = 1.32;
      utter.pitch = 0.9;
      var voice = pickKoreanVoice();
      if (voice) {
        utter.voice = voice;
      }
      utter.onend = resolve;
      utter.onerror = reject;
      window.speechSynthesis.speak(utter);
    });
  }

  function renderVoiceSection(segments) {
    var blocks = segments
      .map(function (seg) {
        return (
          '<div class="voice-transcript__block" data-voice-block="' +
          seg.id +
          '">' +
          '<p class="voice-transcript__label">' +
          '<span class="material-symbols-outlined" style="font-size:1rem">' +
          seg.icon +
          "</span>" +
          escapeHtml(seg.label) +
          "</p>" +
          '<p class="voice-transcript__text">' +
          escapeHtml(seg.text) +
          "</p></div>"
        );
      })
      .join("");

    return (
      '<div class="voice-aurora-wrap">' +
      '<div class="voice-controls">' +
      '<button type="button" class="voice-aurora-btn" id="voice-aurora-btn" aria-live="polite">' +
      '<span class="voice-aurora-btn__rim" aria-hidden="true"></span>' +
      '<span class="voice-aurora-btn__inner">' +
      '<span class="voice-aurora-btn__waves" aria-hidden="true">' +
      '<span class="voice-aurora-wave"></span>' +
      '<span class="voice-aurora-wave"></span>' +
      '<span class="voice-aurora-wave"></span>' +
      "</span>" +
      '<span class="material-symbols-outlined voice-aurora-btn__icon">graphic_eq</span>' +
      '<span data-voice-label>심사위원 음성 평가 듣기</span>' +
      "</span></button>" +
      '<button type="button" class="voice-action-btn voice-pause-btn" id="voice-pause-btn" aria-label="일시 중지">' +
      '<span class="material-symbols-outlined" style="font-size:1.1rem" data-pause-icon>pause</span>' +
      '<span data-pause-label>일시 중지</span>' +
      "</button>" +
      '<button type="button" class="voice-action-btn voice-stop-btn" id="voice-stop-btn" aria-label="음성 중지">' +
      '<span class="material-symbols-outlined" style="font-size:1.1rem">stop</span>' +
      '<span>음성 중지</span>' +
      "</button></div>" +
      '<p class="voice-notice hidden" id="voice-notice" role="status"></p>' +
      '<div class="voice-transcript hidden" id="voice-transcript">' +
      blocks +
      "</div></div>"
    );
  }

  function pickKoreanVoice() {
    if (!window.speechSynthesis) {
      return null;
    }
    var voices = window.speechSynthesis.getVoices();
    var ko = voices.filter(function (v) {
      return v.lang && v.lang.toLowerCase().indexOf("ko") === 0;
    });
    if (!ko.length) {
      return null;
    }
    var preferred = null;
    for (var i = 0; i < ko.length; i += 1) {
      if (/male|heera|hyuna|yuna|injoon|seoyeon/i.test(ko[i].name)) {
        preferred = ko[i];
        break;
      }
    }
    return preferred || ko[0];
  }

  function createVoiceNarrator(segments, btn, pauseBtn, stopBtn, transcript) {
    var index = 0;
    var cancelled = false;
    var paused = false;
    var playing = false;
    var useServerTts = true;
    var usingBrowserTts = false;
    var prefetchCache = Object.create(null);
    var waitPausePromise = null;
    var waitPauseResolve = null;

    function setActiveBlock(id) {
      transcript.querySelectorAll("[data-voice-block]").forEach(function (el) {
        el.classList.toggle(
          "voice-transcript__block--active",
          el.getAttribute("data-voice-block") === id
        );
      });
      var active = transcript.querySelector('[data-voice-block="' + id + '"]');
      if (active) {
        active.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }

    function setButtonState(active, label, isPaused) {
      btn.classList.toggle("voice-aurora-btn--active", active && !isPaused);
      setAuroraOverlay(active, isPaused);
      var labelEl = btn.querySelector("[data-voice-label]");
      if (labelEl) {
        labelEl.textContent = label;
      }
    }

    function setPauseButton(visible, label, iconName, disabled) {
      if (!pauseBtn) {
        return;
      }
      pauseBtn.classList.toggle("voice-action-btn--visible", visible);
      pauseBtn.disabled = !!disabled;
      var labelEl = pauseBtn.querySelector("[data-pause-label]");
      var iconEl = pauseBtn.querySelector("[data-pause-icon]");
      if (labelEl) {
        labelEl.textContent = label;
      }
      if (iconEl) {
        iconEl.textContent = iconName;
      }
      pauseBtn.setAttribute(
        "aria-label",
        label === "재개" ? "재개" : "일시 중지"
      );
    }

    function setStopButton(visible) {
      if (!stopBtn) {
        return;
      }
      stopBtn.classList.toggle("voice-action-btn--visible", visible);
      stopBtn.disabled = !visible;
    }

    function waitWhilePaused() {
      if (!paused) {
        return Promise.resolve();
      }
      if (!waitPausePromise) {
        waitPausePromise = new Promise(function (resolve) {
          waitPauseResolve = resolve;
        });
      }
      return waitPausePromise;
    }

    function releasePauseWait() {
      if (waitPauseResolve) {
        waitPauseResolve();
        waitPauseResolve = null;
        waitPausePromise = null;
      }
    }

    function cleanup() {
      cancelled = true;
      paused = false;
      playing = false;
      releasePauseWait();
      prefetchCache = Object.create(null);
      if (activeVoiceAudio) {
        activeVoiceAudio.pause();
        activeVoiceAudio = null;
      }
      window.speechSynthesis.cancel();
      setButtonState(false, "심사위원 음성 평가 듣기");
      setPauseButton(false, "일시 중지", "pause", false);
      setStopButton(false);
      btn.disabled = false;
      activeVoiceSession = null;
    }

    function prefetchSegment(segIndex) {
      if (
        segIndex >= segments.length ||
        prefetchCache[segIndex] ||
        cancelled
      ) {
        return;
      }
      prefetchCache[segIndex] = fetchTtsAudio(segments[segIndex].text).catch(
        function (error) {
          delete prefetchCache[segIndex];
          throw error;
        }
      );
    }

    function playSegment(text) {
      function runBrowserSpeech() {
        return waitWhilePaused().then(function () {
          if (cancelled) {
            return { completed: false };
          }
          return speakWithBrowser(text).then(function () {
            return { completed: true };
          });
        });
      }

      if (useServerTts) {
        var cached = prefetchCache[index];
        var audioPromise = cached || fetchTtsAudio(text);
        delete prefetchCache[index];
        prefetchSegment(index + 1);

        return audioPromise
          .then(function (blob) {
            return waitWhilePaused().then(function () {
              if (cancelled) {
                return { completed: false };
              }
              return playAudioBlob(blob);
            });
          })
          .then(function (result) {
            if (!result || result.completed === false || cancelled) {
              return { completed: false };
            }
            return { completed: true };
          })
          .catch(function () {
            if (cancelled) {
              return { completed: false };
            }
            useServerTts = false;
            usingBrowserTts = true;
            setPauseButton(true, "일시 중지", "pause", true);
            showVoiceInfo(
              "서버 음성 합성에 문제가 있어 브라우저 음성으로 재생합니다. 일시 중지는 지원되지 않으며 음성 중지로 멈출 수 있습니다."
            );
            return runBrowserSpeech();
          });
      }

      prefetchSegment(index + 1);
      return runBrowserSpeech();
    }

    function speakNext() {
      if (cancelled) {
        return;
      }

      if (index >= segments.length) {
        transcript.querySelectorAll("[data-voice-block]").forEach(function (el) {
          el.classList.remove("voice-transcript__block--active");
        });
        playing = false;
        setButtonState(false, "다시 듣기");
        setPauseButton(false, "일시 중지", "pause", false);
        setStopButton(false);
        btn.disabled = false;
        activeVoiceSession = null;
        return;
      }

      var seg = segments[index];
      setActiveBlock(seg.id);
      setButtonState(true, "재생 중 · 클릭하면 중지", paused);
      setStopButton(true);
      setPauseButton(
        true,
        paused ? "재개" : "일시 중지",
        paused ? "play_arrow" : "pause",
        usingBrowserTts
      );

      playSegment(seg.text)
        .then(function (result) {
          if (cancelled || !result || !result.completed) {
            return;
          }
          index += 1;
          speakNext();
        })
        .catch(function (error) {
          if (cancelled) {
            return;
          }
          showError(error.message || "음성 재생 중 오류가 발생했습니다.");
          cleanup();
        });
    }

    return {
      updateSegments: function (nextSegments) {
        segments = nextSegments;
        prefetchCache = Object.create(null);
      },
      start: function () {
        cancelled = false;
        paused = false;
        playing = true;
        useServerTts = true;
        usingBrowserTts = false;
        index = 0;
        btn.disabled = false;
        transcript.classList.remove("hidden");
        transcript.querySelectorAll("[data-voice-block]").forEach(function (el) {
          el.classList.remove("voice-transcript__block--active");
        });
        hideVoiceInfo();
        setButtonState(true, "음성을 준비하는 중...");
        setPauseButton(true, "일시 중지", "pause", true);
        setStopButton(true);
        var voiceWrap = btn.closest(".voice-aurora-wrap");
        if (voiceWrap) {
          voiceWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        transcript.scrollIntoView({ behavior: "smooth", block: "nearest" });
        prefetchSegment(0);
        speakNext();
      },
      stop: cleanup,
      togglePause: function () {
        if (!playing || cancelled || usingBrowserTts) {
          return;
        }
        paused = !paused;
        if (paused) {
          if (activeVoiceAudio) {
            activeVoiceAudio.pause();
          }
          if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
          }
          setButtonState(true, "일시 중지됨", true);
          setPauseButton(true, "재개", "play_arrow", false);
        } else {
          releasePauseWait();
          if (activeVoiceAudio) {
            activeVoiceAudio.play().catch(function () {});
          } else if (window.speechSynthesis && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          setButtonState(true, "재생 중 · 클릭하면 중지", false);
          setPauseButton(true, "일시 중지", "pause", usingBrowserTts);
        }
      },
      isActive: function () {
        return playing && !cancelled && index < segments.length;
      },
      isPlaying: function () {
        return playing && !cancelled;
      },
    };
  }

  function updateVoiceTranscript(transcript, segments) {
    transcript.innerHTML = segments
      .map(function (seg) {
        return (
          '<div class="voice-transcript__block" data-voice-block="' +
          seg.id +
          '">' +
          '<p class="voice-transcript__label">' +
          '<span class="material-symbols-outlined" style="font-size:1rem">' +
          seg.icon +
          "</span>" +
          escapeHtml(seg.label) +
          "</p>" +
          '<p class="voice-transcript__text">' +
          escapeHtml(seg.text) +
          "</p></div>"
        );
      })
      .join("");
  }

  function bindVoiceNarrator(data) {
    var btn = document.getElementById("voice-aurora-btn");
    var pauseBtn = document.getElementById("voice-pause-btn");
    var transcript = document.getElementById("voice-transcript");
    if (!btn || !transcript) {
      return;
    }

    var segments = buildVoiceSegmentsFallback(data);
    var stopBtn = document.getElementById("voice-stop-btn");
    var narrator = createVoiceNarrator(segments, btn, pauseBtn, stopBtn, transcript);
    var narrationLoaded = false;
    var narrationPromise = null;

    function ensureNarration() {
      if (narrationLoaded) {
        return Promise.resolve(segments);
      }
      if (narrationPromise) {
        return narrationPromise;
      }

      narrationPromise = fetchVoiceNarration(data)
        .then(function (payload) {
          if (payload && payload.segments && payload.segments.length) {
            segments = payload.segments;
            updateVoiceTranscript(transcript, segments);
            narrator.updateSegments(segments);
          }
          if (payload && payload.fallback) {
            showVoiceInfo(
              "AI 맞춤 대본 생성에 실패해 기본 대본으로 재생합니다. 음성은 정상 재생되니 화면의 점수표와 최종 한마디도 함께 확인해 주세요."
            );
          }
          narrationLoaded = true;
          return segments;
        })
        .catch(function () {
          showVoiceInfo(
            "AI 맞춤 대본 생성에 실패해 기본 대본으로 재생합니다. 음성은 정상 재생되니 화면의 점수표와 최종 한마디도 함께 확인해 주세요."
          );
          narrationLoaded = true;
          return segments;
        })
        .finally(function () {
          narrationPromise = null;
        });

      return narrationPromise;
    }

    btn.addEventListener("click", function () {
      if (activeVoiceSession && activeVoiceSession.isPlaying()) {
        activeVoiceSession.stop();
        return;
      }
      if (activeVoiceSession) {
        activeVoiceSession.stop();
      }
      window.speechSynthesis.cancel();

      btn.disabled = true;
      setButtonStateLabel(btn, "대본을 작성하는 중...");
      ensureNarration().then(function () {
        activeVoiceSession = narrator;
        narrator.start();
      });
    });

    if (pauseBtn) {
      pauseBtn.addEventListener("click", function () {
        if (activeVoiceSession && activeVoiceSession.isPlaying()) {
          activeVoiceSession.togglePause();
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener("click", function () {
        if (activeVoiceSession && activeVoiceSession.isPlaying()) {
          activeVoiceSession.stop();
        }
      });
    }
  }

  function setButtonStateLabel(btn, label) {
    var labelEl = btn.querySelector("[data-voice-label]");
    if (labelEl) {
      labelEl.textContent = label;
    }
  }

  function renderTable(rows, columns) {
    var head = columns
      .map(function (col) {
        return '<th class="result-th">' + escapeHtml(col) + "</th>";
      })
      .join("");
    var body = rows
      .map(function (row) {
        var cells = columns
          .map(function (col) {
            return (
              '<td class="result-td">' + escapeHtml(String(row[col])) + "</td>"
            );
          })
          .join("");
        return "<tr>" + cells + "</tr>";
      })
      .join("");
    return (
      '<table class="result-table"><thead><tr>' +
      head +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table>"
    );
  }

  function renderResults(data) {
    if (activeVoiceSession) {
      activeVoiceSession.stop();
    }
    if (activeVoiceAudio) {
      activeVoiceAudio.pause();
      activeVoiceAudio = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setAuroraOverlay(false);
    hideVoiceInfo();

    var warnings = "";
    if (data.evaluation_mode === "fatal_zero") {
      warnings +=
        '<p class="result-warning">입력된 기획서·레포 내용이 심사 기준을 충족하지 않아 전 항목 0점으로 처리되었습니다.</p>';
    } else if (data.evaluation_mode === "partial") {
      warnings +=
        '<p class="result-warning">일부 분야는 입력 검증 미통과로 0점 처리되었습니다. 분야별·세부 점수를 확인해 주세요.</p>';
    } else if (data.evaluation_mode === "full_zero") {
      warnings +=
        '<p class="result-warning">모든 분야 점수가 0점입니다. 제출 내용과 심사 기준을 다시 확인해 주세요.</p>';
    }
    if (data.review_fallback) {
      warnings +=
        '<p class="result-warning">총평 자동 생성에 일시적인 문제가 있어 기본 후기를 표시했습니다. 점수표는 정상 반영되었습니다.</p>';
    }
    if (data.repo && data.repo.url) {
      var fileCount = data.repo.files ? data.repo.files.length : 0;
      warnings +=
        '<p class="result-repo-note">분석 레포: <a class="result-repo-note__link" href="' +
        escapeHtml(data.repo.url) +
        '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(data.repo.url) +
        "</a> (" +
        escapeHtml(data.repo.branch || "main") +
        " · " +
        fileCount +
        "개 파일 수집)</p>";
    }

    var verdictLines = data.final_verdict
      .split(/(?<=[.!?])\s+|\n+/)
      .filter(function (line) {
        return line.trim();
      })
      .slice(0, 4)
      .map(function (line) {
        return line.trim();
      });

    var voiceSegments = buildVoiceSegmentsFallback(data);

    resultsPanel.innerHTML =
      warnings +
      '<div class="result-hero">' +
      '<span class="result-hero-label">종합 점수</span>' +
      '<span class="result-hero-value">' +
      data.total_score +
      "</span>" +
      "</div>" +
      '<div class="result-metrics">' +
      '<div class="result-metric"><span class="result-metric-label">공공기관 적합성</span><span class="result-metric-value">' +
      data.public_sector_score +
      "</span></div>" +
      '<div class="result-metric"><span class="result-metric-label">의도 구현도</span><span class="result-metric-value">' +
      data.intent_implementation_score +
      "</span></div>" +
      '<div class="result-metric"><span class="result-metric-label">README 품질</span><span class="result-metric-value">' +
      data.readme_quality_score +
      "</span></div>" +
      "</div>" +
      '<h3 class="result-section-title">분야별 점수</h3>' +
      renderTable(data.domain_summary_rows, ["분야", "점수"]) +
      '<h3 class="result-section-title">세부 점수</h3>' +
      renderTable(data.detail_score_rows, ["분야", "세부 항목", "점수"]) +
      renderVerdict(verdictLines) +
      renderVoiceSection(voiceSegments);

    bindVoiceNarrator(data);
    resultsPanel.classList.remove("opacity-50");
    resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle("opacity-60", isLoading);
    submitBtn.classList.toggle("cursor-not-allowed", isLoading);
    var label = submitBtn.querySelector("[data-submit-label]");
    var spinner = submitBtn.querySelector("[data-submit-spinner]");
    if (label) {
      label.textContent = isLoading ? "심사 중..." : "심사 시작";
    }
    if (spinner) {
      spinner.classList.toggle("hidden", !isLoading);
    }
  }

  submitBtn.addEventListener("click", function () {
    hideError();

    var plan = gettersByKey.plan ? gettersByKey.plan() : "";
    var repoUrl = normalizeGithubUrl(repoUrlInput.value);

    if (!plan) {
      showError("기획서 파일을 업로드해 주세요.");
      return;
    }
    if (!repoUrl) {
      showError("GitHub 레포 URL을 입력해 주세요.");
      return;
    }
    if (!isValidGithubRepoUrl(repoUrl)) {
      showError(
        "GitHub 레포 URL 형식이 올바르지 않습니다. 예: https://github.com/사용자/프로젝트"
      );
      return;
    }

    setLoading(true);
    resultsPanel.innerHTML =
      '<div class="flex flex-col items-center justify-center py-2xl">' +
      '<span class="material-symbols-outlined text-primary mb-md text-4xl animate-pulse">hourglass_top</span>' +
      '<p class="font-body-md text-body-md text-on-surface-variant">심사위원이 평가 중입니다...</p>' +
      "</div>";
    resultsPanel.classList.remove("opacity-50");

    fetchWithTimeout(
      "/api/evaluate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan, repo_url: repoUrl }),
      },
      EVALUATE_TIMEOUT_MS
    )
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (payload) {
            if (!response.ok) {
              throw new Error(
                formatApiError(payload, "심사 요청에 실패했습니다.")
              );
            }
            return validateEvaluateResponse(payload);
          });
      })
      .then(renderResults)
      .catch(function (error) {
        var message = error.message || "심사 중 오류가 발생했습니다.";
        if (error.name === "AbortError") {
          message =
            "심사 요청 시간이 초과되었습니다(3분). 네트워크 상태를 확인한 뒤 다시 시도해 주세요.";
        } else if (message === "Failed to fetch") {
          message =
            "API 서버에 연결할 수 없습니다. uvicorn api:app 으로 서버를 실행했는지 확인해 주세요.";
        }
        showError(message);
        resultsPanel.innerHTML =
          '<div class="mt-auto border-t border-outline-variant/10 pt-2xl flex flex-col items-center justify-center opacity-50">' +
          '<span class="material-symbols-outlined text-outline mb-md text-4xl">error_outline</span>' +
          '<p class="font-body-md text-body-md text-on-surface-variant">심사를 완료하지 못했습니다</p>' +
          '<p class="font-code-sm text-code-sm text-outline mt-sm">오류 메시지를 확인한 뒤 다시 시도해 주세요.</p>' +
          "</div>";
        resultsPanel.classList.add("opacity-50");
      })
      .finally(function () {
        setLoading(false);
      });
  });
})();
