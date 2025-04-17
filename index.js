"use strict";

// --- State ---
let newSong = "", newArtist = "", newAlbum = "", newTrackId = "";
let currentSong = "", currentArtist = "", currentAlbum = "", currentTrackId = "";
let isPlaying = false, previousIsPlaying = false, isLoadingCanvas = false;
let lastAlbumUpdate = 0;

const videoLoadTimeout = 50000;
const apiRetryDelay = 1000;
const maxApiRetries = 10; // Set max retries to 10

// --- Utility ---
const timeout = ms => new Promise(res => setTimeout(res, ms));
const debugLog = msg => console.log("[NowPlaying Debug]", msg);

// --- Data Fetch ---
async function readSpotilocalData() {
    try {
        const response = await fetch("Spotilocal.json");
        if (!response.ok) throw new Error("Failed to fetch Spotilocal.json: " + response.status);
        const data = await response.json();
        isPlaying = data && data.isPlaying;
        if (!data) return null;
        return {
            artist: data.currentArtists?.[0]?.name || "",
            track: data.currentTrack?.name || "",
            album: data.currentAlbum?.name || "",
            trackId: data.currentTrack?.uri?.split("spotify:track:")[1] || "",
            albumArt: data.currentAlbum?.image_large || "",
            isPlaying: data.isPlaying
        };
    } catch (e) {
        console.error("Error reading Spotilocal data:", e);
        return null;
    }
}

// --- Metadata Polling ---
async function checkMetadata() {
    try {
        const spotilocalData = await readSpotilocalData();
        if (spotilocalData) {
            newArtist = spotilocalData.artist;
            newSong = spotilocalData.track;
            newAlbum = spotilocalData.album;
            newTrackId = spotilocalData.trackId;
            if (isPlaying !== previousIsPlaying) {
                debugLog("Playback state changed: " + (isPlaying ? "Playing" : "Paused"));
                updatePlaybackState();
                previousIsPlaying = isPlaying;
            }
            if (newSong !== currentSong || newArtist !== currentArtist || newAlbum !== currentAlbum || newTrackId !== currentTrackId) {
                await animateMetadataTransition();
            }
        }
        await timeout(2000);
    } catch (e) {
        console.error(e);
    }
    await checkMetadata();
}

// --- UI State ---
function updatePlaybackState() {
    const canvasVideo = document.getElementById("canvasvideo");
    const albumImage = document.getElementById("albumimage");
    const topLabel = document.getElementById("topLabel");
    const bottomLabel = document.getElementById("bottomLabel");
    if (!isPlaying) {
        if (canvasVideo) fadeOutElement(canvasVideo, () => {
            canvasVideo.pause();
            canvasVideo.removeAttribute('src');
            canvasVideo.load();
        });
        if (albumImage) fadeOutElement(albumImage); // Hide album cover when paused
        if (topLabel) fadeOutElement(topLabel);
        if (bottomLabel) fadeOutElement(bottomLabel);
        debugLog("Paused: Fading out elements");
    } else if (!isLoadingCanvas) {
        if (newTrackId) tryLoadCanvasVideo(newTrackId);
        if (canvasVideo && canvasVideo.style.opacity === '1') {
            if (albumImage) fadeOutElement(albumImage); // Hide album cover when video is playing
        } else {
            if (albumImage) fadeInElement(albumImage); // Keep album cover visible if video is not playing
        }
        if (topLabel) fadeInElement(topLabel);
        if (bottomLabel) fadeInElement(bottomLabel);
        debugLog("Playing: Attempting to show elements");
    }
}

// --- Animation Helpers ---
const fadeDuration = 500;
function fadeInElement(element) {
    if (!element || element.style.opacity === '1') return;
    element.style.transition = `opacity ${fadeDuration / 1000}s ease-in-out`;
    element.style.opacity = '0';
    element.style.display = 'block';
    setTimeout(() => { element.style.opacity = '1'; }, 20);
}

function fadeOutElement(element, callback) {
    if (!element || element.style.opacity === '0' || element.style.display === 'none') {
        if (callback) callback();
        return;
    }
    element.style.transition = `opacity ${fadeDuration / 1000}s ease-in-out`;
    setTimeout(() => { element.style.opacity = '0'; }, 20);
    setTimeout(() => {
        if (callback) callback();
    }, fadeDuration + 30);
}

function copyStyles(source, target) {
    if (!source || !target) return;
    const cs = window.getComputedStyle(source);
    target.style.borderRadius = cs.borderRadius;
    target.style.width = source.offsetWidth + "px";
    target.style.height = source.offsetHeight + "px";
    target.style.top = source.offsetTop + "px";
    target.style.left = source.offsetLeft + "px";
    target.style.position = "absolute";
    target.style.objectFit = "cover";
    target.style.zIndex = "1";
}

// --- Canvas Video Loader (Finite Retry) ---
async function tryLoadCanvasVideo(trackId) {
    const albumImage = document.getElementById("albumimage");
    if (isLoadingCanvas) {
        debugLog("Already loading canvas, skipping request");
        return;
    }
    if (!trackId || !isPlaying) {
        debugLog("No track ID provided or playback is paused");
        if (albumImage) fadeInElement(albumImage); // Ensure album cover is visible
        return;
    }
    if (!albumImage) {
        debugLog("Album image element not found, cannot load canvas");
        return;
    }

    // Fade in album cover while fetching API
    fadeInElement(albumImage);

    isLoadingCanvas = true;
    debugLog("Loading canvas for track ID: " + trackId);
    const canvasApiUrl = `https://api.paxsenix.biz.id/spotify/canvas?id=${trackId}`;
    let retryCount = 0;
    let canvasUrl = null;

    // Retry logic with delays
    while (retryCount < maxApiRetries) {
        debugLog(`Attempting to fetch canvas data (Attempt ${retryCount + 1}/${maxApiRetries})`);
        try {
            const response = await fetch(canvasApiUrl);
            if (!response.ok) throw new Error("API request failed with status " + response.status);
            const canvasData = await response.json();
            debugLog("API Response Data: " + JSON.stringify(canvasData));

            if (
                canvasData &&
                canvasData.ok &&
                Array.isArray(canvasData.data?.canvasesList) &&
                canvasData.data.canvasesList.length > 0
            ) {
                canvasUrl = canvasData.data.canvasesList[0]?.canvasUrl;
                debugLog("Canvas URL found: " + canvasUrl);
                break;
            } else if (canvasData && canvasData.ok && Array.isArray(canvasData.data?.canvasesList) && canvasData.data.canvasesList.length === 0) {
                debugLog("No video available for this song (empty canvasesList)");
                isLoadingCanvas = false;
                return; // Keep album cover visible
            } else {
                debugLog("No valid canvas data found. Retrying...");
            }
        } catch (e) {
            debugLog("Error fetching canvas data: " + e);
        }
        retryCount++;
        debugLog(`Waiting ${apiRetryDelay}ms before next retry...`);
        await timeout(apiRetryDelay);
    }

    if (!canvasUrl) {
        debugLog("No usable canvas found after retries.");
        isLoadingCanvas = false;
        return; // Keep album cover visible
    }

    let canvasVideo = document.getElementById("canvasvideo");
    if (!canvasVideo) {
        debugLog("Creating new canvas video element");
        canvasVideo = document.createElement("video");
        canvasVideo.id = "canvasvideo";
        canvasVideo.loop = true;
        canvasVideo.muted = true;
        canvasVideo.autoplay = false;
        canvasVideo.playsInline = true;
        canvasVideo.style.transition = "opacity 0.5s ease-in-out";
        canvasVideo.style.opacity = "0";
        copyStyles(albumImage, canvasVideo);
        const container = albumImage.parentNode;
        if (container) {
            container.insertBefore(canvasVideo, albumImage);
        } else {
            debugLog("Album image container not found, cannot insert canvas video");
            isLoadingCanvas = false;
            return; // Keep album cover visible
        }
    }

    canvasVideo.style.opacity = "0";
    canvasVideo.onloadeddata = null;
    canvasVideo.onerror = null;

    let videoLoadSuccess = false;
    const loadTimeoutId = setTimeout(() => {
        if (!videoLoadSuccess) {
            debugLog("Canvas video loading timed out after " + videoLoadTimeout + "ms");
            canvasVideo.style.display = "none";
            canvasVideo.removeAttribute("src");
            canvasVideo.load();
            isLoadingCanvas = false;
        }
    }, videoLoadTimeout);

    // Continuously check if the album cover is showing every 10ms
    const albumCheckInterval = setInterval(() => {
        if (albumImage.style.opacity === '1') {
            debugLog("Album cover is visible while waiting for video.");
        }
    }, 10);

    canvasVideo.onloadeddata = function () {
        clearTimeout(loadTimeoutId);
        clearInterval(albumCheckInterval); // Stop checking once the video is loaded
        videoLoadSuccess = true;

        if (!isPlaying) {
            debugLog("Playback stopped after video loaded");
            canvasVideo.style.display = "none";
            isLoadingCanvas = false;
            return; // Keep album cover visible
        }

        canvasVideo.play().then(() => {
            debugLog("Canvas video playing successfully");
            fadeInElement(canvasVideo); // Fade in video
            fadeOutElement(albumImage); // Hide album cover when video plays
            isLoadingCanvas = false;
        }).catch(error => {
            debugLog("Error playing canvas video: " + error);
            canvasVideo.style.display = "none";
            isLoadingCanvas = false;
        });
    };

    canvasVideo.onerror = function () {
        clearTimeout(loadTimeoutId);
        clearInterval(albumCheckInterval); // Stop checking on error
        debugLog("Error loading canvas video");
        canvasVideo.style.display = "none";
        isLoadingCanvas = false;
    };

    canvasVideo.style.display = "block";
    canvasVideo.setAttribute("src", canvasUrl);
    canvasVideo.load();
}

// --- Album Image Update ---
function forceAlbumImageUpdate() {
    const now = Date.now();
    if (now - lastAlbumUpdate > 1000) {
        const albumImage = document.getElementById("albumimage");
        if (albumImage) {
            const cacheBuster = "?t=" + now;
            albumImage.src = "Spotilocal_Large.png" + cacheBuster;
            lastAlbumUpdate = now;
            debugLog("Forced album image update with cache buster: " + cacheBuster);
        }
    }
}
async function updateAlbumImage(albumImage) {
    try {
        const spotilocalData = await readSpotilocalData();
        if (!spotilocalData) return;
        forceAlbumImageUpdate();
        if (spotilocalData.trackId && isPlaying && !isLoadingCanvas) {
            tryLoadCanvasVideo(spotilocalData.trackId);
        }
    } catch (e) {
        console.error("Error updating album image:", e);
    }
}

// --- Animate Metadata Transition ---
async function animateMetadataTransition() {
    const topValue = await getValueForTopLabel();
    const bottomValue = await getValueForBottomLabel();
    if (currentSong.length === 0 && newSong.length > 0) {
        await slideUpAlbumImage().catch(() => {});
        await Promise.all([showBottomLabel(bottomValue), showTopLabel(topValue)]);
    } else if (currentSong.length > 0 && bottomValue.length === 0) {
        await Promise.all([hideTopLabel(), hideBottomLabel()]);
        await slideDownAlbumImage();
    } else if (currentAlbum !== newAlbum || newAlbum.length === 0 || currentTrackId !== newTrackId) {
        await Promise.all([fadeOutAlbumImage(), hideTopLabel(), hideBottomLabel()]);
        await Promise.all([fadeInAlbumImage().catch(() => {}), showTopLabel(topValue), showBottomLabel(bottomValue)]);
    } else if (currentArtist !== newArtist) {
        await Promise.all([hideTopLabel(), hideBottomLabel()]);
        await Promise.all([showTopLabel(topValue), showBottomLabel(bottomValue)]);
    } else {
        await hideBottomLabel();
        await showBottomLabel(bottomValue);
    }
    const delayBeforeDisappearance = await getValueForDelayBeforeDisappearance();
    if (delayBeforeDisappearance) {
        await timeout(delayBeforeDisappearance * 1000);
        await Promise.all([hideTopLabel(), hideBottomLabel()]);
        await slideDownAlbumImage();
    }
    currentArtist = newArtist;
    currentSong = newSong;
    currentAlbum = newAlbum;
    currentTrackId = newTrackId;
}

// --- Label/Album Animations ---
async function showElement(element, animation) {
    element.style.removeProperty('display');
    await animateCSS(`#${element.id}`, animation).catch(() => {});
}
async function hideElement(element, animation, callback) {
    return new Promise(resolve => {
        const style = window.getComputedStyle(element);
        if (style.display === 'none') {
            if (callback) callback();
            resolve();
            return;
        }
        animateCSS(`#${element.id}`, animation).then(() => {
            element.style.setProperty('display', 'none');
            if (callback) callback();
            resolve();
        }).catch(resolve);
    });
}
async function showBottomLabel(innerHTML) {
    const bottomLabel = document.getElementById("bottomLabel");
    if (!bottomLabel) return;
    bottomLabel.innerHTML = innerHTML;
    await showElement(bottomLabel, 'fadeInLeft');
}
async function showTopLabel(innerHTML) {
    const topLabel = document.getElementById("topLabel");
    if (!topLabel) return;
    topLabel.innerHTML = innerHTML;
    await showElement(topLabel, 'fadeInLeft');
}
async function hideBottomLabel() {
    const bottomLabel = document.getElementById("bottomLabel");
    if (!bottomLabel) return;
    await hideElement(bottomLabel, 'fadeOutLeft');
}
async function hideTopLabel() {
    const topLabel = document.getElementById("topLabel");
    if (!topLabel) return;
    await hideElement(topLabel, 'fadeOutLeft');
}
async function slideUpAlbumImage() {
    const albumImage = document.getElementById("albumimage");
    if (!albumImage) return;
    await updateAlbumImage(albumImage);
    await showElement(albumImage, 'fadeInUp');
}
async function fadeInAlbumImage() {
    const albumImage = document.getElementById("albumimage");
    if (!albumImage) return;
    albumImage.style.removeProperty('animation-delay');
    await updateAlbumImage(albumImage);
    await showElement(albumImage, 'fadeInUp'); // Use Animate.css for smooth animation
}
async function slideDownAlbumImage() {
    const albumImage = document.getElementById("albumimage");
    const canvasVideo = document.getElementById("canvasvideo");
    if (!albumImage) return;
    if (canvasVideo) {
        await new Promise(resolve => fadeOutElement(canvasVideo, () => {
            canvasVideo.pause();
            canvasVideo.removeAttribute('src');
            canvasVideo.load();
            resolve();
        }));
    }
    await hideElement(albumImage, 'fadeOutDown');
}
async function fadeOutAlbumImage() {
    const albumImage = document.getElementById("albumimage");
    const canvasVideo = document.getElementById("canvasvideo");
    if (!albumImage) return;
    if (canvasVideo) {
        await new Promise(resolve => fadeOutElement(canvasVideo, () => {
            canvasVideo.pause();
            canvasVideo.removeAttribute('src');
            canvasVideo.load();
            resolve();
        }));
    }
    albumImage.style.setProperty('animation-delay', '0.3s');
    await new Promise(resolve => fadeOutElement(albumImage, resolve));
    albumImage.style.removeProperty('animation-delay');
}

// --- Animate.css Helper ---
function animateCSS(element, animation, prefix = 'animate__') {
    return new Promise((resolve, reject) => {
        const animationName = `${prefix}${animation}`;
        const node = document.querySelector(element);
        if (!node) {
            reject("Element couldn't be found, nothing to animate");
            return;
        }
        const style = window.getComputedStyle(node);
        if (style.display === 'none') {
            resolve('Element is hidden (display: none), nothing to animate');
            return;
        }
        node.classList.add(`${prefix}animated`, animationName);
        function handleAnimationEnd(event) {
            if (event.target !== node) return;
            event.stopPropagation();
            node.classList.remove(`${prefix}animated`, animationName);
            resolve('Animation ended');
        }
        node.addEventListener('animationend', handleAnimationEnd, { once: true });
        node.addEventListener('animationcancel', handleAnimationEnd, { once: true });
    });
}

// --- Settings Helpers ---
async function getValueForTopLabel() {
    try {
        const result = await fetch("settings.json");
        if (!result.ok) throw new Error("Failed to fetch settings.json: " + result.status);
        const json = await result.json();
        switch (json["topLabel"]) {
            case "artist": return newArtist;
            case "track": return newSong;
            case "album": return newAlbum;
            default: return newArtist;
        }
    } catch (e) {
        console.error("Error getting top label value:", e);
        return newArtist;
    }
}
async function getValueForBottomLabel() {
    try {
        const result = await fetch("settings.json");
        if (!result.ok) throw new Error("Failed to fetch settings.json: " + result.status);
        const json = await result.json();
        switch (json["bottomLabel"]) {
            case "artist": return newArtist;
            case "track": return newSong;
            case "album": return newAlbum;
            default: return newSong;
        }
    } catch (e) {
        console.error("Error getting bottom label value:", e);
        return newSong;
    }
}
async function getValueForDelayBeforeDisappearance() {
    try {
        const result = await fetch("settings.json");
        if (!result.ok) throw new Error("Failed to fetch settings.json: " + result.status);
        const json = await result.json();
        return json["delayBeforeDisappearance"] ? Number(json["delayBeforeDisappearance"]) : null;
    } catch (e) {
        console.error("Error getting delay before disappearance value:", e);
        return null;
    }
}

// --- Responsive Canvas Video ---
window.addEventListener('resize', () => {
    const albumImage = document.getElementById("albumimage");
    const canvasVideo = document.getElementById("canvasvideo");
    if (albumImage && canvasVideo && canvasVideo.style.display !== 'none') {
        copyStyles(albumImage, canvasVideo);
    }
});

// --- DOM Ready ---
document.addEventListener("DOMContentLoaded", () => {
    debugLog("DOM loaded, starting metadata check");
    checkMetadata();
    const albumImage = document.getElementById("albumimage");
    if (!albumImage) {
        console.error("Critical error: Album image element (#albumimage) not found!");
    }
});

