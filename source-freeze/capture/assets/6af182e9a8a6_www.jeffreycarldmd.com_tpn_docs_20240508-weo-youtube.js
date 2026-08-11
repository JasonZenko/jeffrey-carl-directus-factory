/*
 * Dynamically load in YouTube videos based on 'data-id'
 * Used for bootstrap carousels | modals | background videos
 *
============================================================================================
//  Copyright (c) 2011-2019 WEO MEDIA (TouchPoint Communications LLC). All rights reserved.
//   UNAUTHORIZED USE IS STRICTLY PROHIBITED
//   FOR QUESTIONS AND APPROPRIATE LICENSING PLEASE CONTACT WEO MEDIA
//   www.weomedia.com | info@weomedia.com
//
//   Some portions of code (modified and unmodified) have been included from public,
//   or open source, sources and have been indicated as appropriate.
//
//   ***** LIMITATION OF LIABILITY *****
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
//  INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
//  PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
//  LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
//  TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
//  OR OTHER DEALINGS IN THE SOFTWARE.
//   ***********************************
============================================================================================
*/

// Load the YouTube Iframe API
// source: https://developers.google.com/youtube/iframe_api_reference

var youtubeScriptId = "youtube-api";
var youtubeScript = document.getElementById(youtubeScriptId);

if (youtubeScript === null) {
  var tag = document.createElement("script");
  var firstScript = document.getElementsByTagName("script")[0];

  tag.src = "https://www.youtube.com/iframe_api";
  tag.id = youtubeScriptId;
  firstScript.parentNode.insertBefore(tag, firstScript);
}

// Object name for interacting with the videos in the rest of this code
var videoArray = new Array();

// Function: onYouTubePlayerAPIReady - Run when API is ready
window.onYouTubeIframeAPIReady = function () {
  console.log("YouTube API Ready");

  // Look for video 'data-id' in these div's
  var videosB = document.querySelectorAll(".TPyt-background");

  // For Background Videos
  for (var k = 0; k < videosB.length; k++) {
    // Create an array to hold the video IDs from 'data-id'
    dataset = videosB[k].dataset.id;

    // Variable name for inserting videos into the HTML divs
    var divID = "vid-bkgd-" + k.toString();

    // Setup video object, configure how videos should be presented
    videoArray[k] = new YT.Player(divID, {
      height: "100%",
      width: "100%",
      playerVars: {
        autoplay: 1,
        mute: 1,
        autohide: 1,
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        rel: 0,
        loop: 1,
        iv_load_policy: 3,
        playlist: dataset,
        playsinline: 1,
      },
      videoId: dataset,
      events: {
        onReady: BGonPlayerReady,
        onStateChange: BGonPlayerStateChange,
      },
    });

    // Get the youtube video thumbnail, to mask the video while it's loading
    const videoOverlay = document.querySelector(".TPvideo-overlay-image");
    videoOverlay.style.backgroundImage =
      "url(https://img.youtube.com/vi/" + dataset + "/maxresdefault.jpg)";
  }
};

function BGonPlayerReady(event) {
  event.target.playVideo();

  // To avoid the buffering at the end of the video
  setInterval(async function () {
    // Get the duration of the currently playing video
    const videoDuration = await event.target.getDuration();
    console.log("videoDuration:", videoDuration);
    const videoCurrentTime = await event.target.getCurrentTime();
    const timeDifference = videoDuration - videoCurrentTime;

    if (2 > timeDifference > 0) {
      event.target.seekTo(0);
    }
  }, 1000);
}

function BGonPlayerStateChange(event) {
  // Get the youtube video thumbnail, to mask the video while it's loading
  var videoOverlay = document.querySelector(".TPvideo-overlay-image");

  // Fade out the image once the video is loaded and ready to play
  if (event.data == YT.PlayerState.PLAYING) {
    videoOverlay.classList.add("TPvideo-overlay-fadeOut");
  }
}
