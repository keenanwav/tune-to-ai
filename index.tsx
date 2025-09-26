import { GoogleGenAI } from "@google/genai";

const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_API_KEY = process.env.API_KEY;

// The discovery doc for the YouTube API.
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest';
// The scope for uploading videos.
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload';


class TuneToTubeApp {
  private gapi: any;
  private google: any;
  private ai: GoogleGenAI;

  private isSignedIn = false;
  private audioFile: File | null = null;
  private gifFile: File | null = null;

  // DOM Elements
  private mainContent: HTMLElement;
  private authContainer: HTMLElement;
  private authButton: HTMLButtonElement;
  private configError: HTMLElement;
  private fileInput: HTMLInputElement;
  private audioStatus: HTMLElement;
  private gifStatus: HTMLElement;
  private titleInput: HTMLInputElement;
  private descriptionInput: HTMLTextAreaElement;
  private tagsInput: HTMLInputElement;
  private privacyOptions: HTMLElement;
  private uploadButton: HTMLButtonElement;
  private uploadStatus: HTMLElement;
  private generateTitleBtn: HTMLButtonElement;
  private generateDescBtn: HTMLButtonElement;


  constructor() {
    this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    this.cacheDOMElements();
    this.init();
  }
  
  private cacheDOMElements() {
    this.mainContent = document.getElementById('main-content')!;
    this.authContainer = document.getElementById('auth-container')!;
    this.authButton = document.getElementById('auth-button') as HTMLButtonElement;
    this.configError = document.getElementById('config-error')!;
    this.fileInput = document.getElementById('file-input') as HTMLInputElement;
    this.audioStatus = document.getElementById('audio-status')!;
    this.gifStatus = document.getElementById('gif-status')!;
    this.titleInput = document.getElementById('title') as HTMLInputElement;
    this.descriptionInput = document.getElementById('description') as HTMLTextAreaElement;
    this.tagsInput = document.getElementById('tags') as HTMLInputElement;
    this.privacyOptions = document.getElementById('privacy-options')!;
    this.uploadButton = document.getElementById('upload-button') as HTMLButtonElement;
    this.uploadStatus = document.getElementById('upload-status')!;
    this.generateTitleBtn = document.getElementById('generate-title-btn') as HTMLButtonElement;
    this.generateDescBtn = document.getElementById('generate-desc-btn') as HTMLButtonElement;
  }

  private init() {
    if (!YOUTUBE_CLIENT_ID || !YOUTUBE_API_KEY || !GEMINI_API_KEY) {
      this.mainContent.classList.add('disabled');
      this.configError.classList.remove('hidden');
      this.configError.innerHTML = `<p><strong>Configuration Error:</strong> Required API keys are missing. Please ensure YOUTUBE_CLIENT_ID, YOUTUBE_API_KEY, and API_KEY are configured in your environment.</p>`;
      return;
    }

    this.authButton.addEventListener('click', this.handleAuthClick.bind(this));
    this.fileInput.addEventListener('change', this.handleFileChange.bind(this));
    this.titleInput.addEventListener('input', this.validateForm.bind(this));
    this.privacyOptions.addEventListener('click', this.handlePrivacyChange.bind(this));
    this.uploadButton.addEventListener('click', this.handleUpload.bind(this));
    this.generateTitleBtn.addEventListener('click', () => this.generateWithAI('title'));
    this.generateDescBtn.addEventListener('click', () => this.generateWithAI('description'));
    
    this.loadGapi();
  }

  private loadGapi() {
    (window as any).gapi.load('client:auth2', async () => {
      await (window as any).gapi.client.init({
        apiKey: YOUTUBE_API_KEY,
        clientId: YOUTUBE_CLIENT_ID,
        discoveryDocs: [DISCOVERY_DOC],
        scope: SCOPES,
      });
      this.gapi = (window as any).gapi;
      this.google = (window as any).google;
      
      const authInstance = this.gapi.auth2.getAuthInstance();
      authInstance.isSignedIn.listen(this.updateSigninStatus.bind(this));
      this.updateSigninStatus(authInstance.isSignedIn.get());
    });
  }

  private handleAuthClick() {
    if (this.isSignedIn) {
      this.gapi.auth2.getAuthInstance().signOut();
    } else {
      this.gapi.auth2.getAuthInstance().signIn();
    }
  }

  private updateSigninStatus(isSignedIn: boolean) {
    this.isSignedIn = isSignedIn;
    if (isSignedIn) {
      this.mainContent.classList.remove('disabled');
      this.renderUserInfo();
    } else {
      this.mainContent.classList.add('disabled');
      this.authContainer.innerHTML = `<button id="auth-button">Sign in with Google</button>`;
      document.getElementById('auth-button')!.addEventListener('click', this.handleAuthClick.bind(this));
    }
  }
  
  private renderUserInfo() {
      const user = this.gapi.auth2.getAuthInstance().currentUser.get();
      const profile = user.getBasicProfile();
      this.authContainer.innerHTML = `
        <div class="user-info">
            <img src="${profile.getImageUrl()}" alt="User profile picture">
            <span>${profile.getName()}</span>
            <button id="signout-button">Sign Out</button>
        </div>
      `;
      document.getElementById('signout-button')!.addEventListener('click', this.handleAuthClick.bind(this));
  }

  private handleFileChange(event: Event) {
    const files = (event.target as HTMLInputElement).files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (file.type.startsWith('audio/')) {
        this.audioFile = file;
        this.updateFileStatus(this.audioStatus, 'Audio', file.name);
      } else if (file.type === 'image/gif') {
        this.gifFile = file;
        this.updateFileStatus(this.gifStatus, 'GIF', file.name);
      }
    }
    this.validateForm();
  }
  
  private updateFileStatus(element: HTMLElement, type: string, name: string) {
      element.className = 'status-indicator success';
      element.innerHTML = `<span>${type}: ${name}</span>`;
  }
  
  private handlePrivacyChange(event: Event) {
      const target = event.target as HTMLButtonElement;
      if (target.tagName === 'BUTTON') {
          this.privacyOptions.querySelector('.active')?.classList.remove('active');
          target.classList.add('active');
      }
  }

  private validateForm() {
    const isReady = this.audioFile !== null && this.gifFile !== null && this.titleInput.value.trim() !== '';
    this.uploadButton.disabled = !isReady;
  }

  private async generateWithAI(type: 'title' | 'description') {
    if (!this.audioFile) {
        alert('Please select an audio file first.');
        return;
    }

    const button = type === 'title' ? this.generateTitleBtn : this.generateDescBtn;
    const input = type === 'title' ? this.titleInput : this.descriptionInput;
    const originalContent = button.innerHTML;
    button.innerHTML = '✨';
    button.classList.add('loading');
    button.disabled = true;

    try {
        const prompt = type === 'title' 
            ? `Generate a catchy, short YouTube video title for a song with the filename "${this.audioFile.name}".`
            : `Generate a YouTube video description for a song with the filename "${this.audioFile.name}". Include a brief sentence about the mood of the song and 3-5 relevant hashtags at the end.`;
        
        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        input.value = response.text.trim().replace(/^"|"$/g, ''); // Remove quotes if AI adds them
    } catch (error) {
        console.error('Gemini API error:', error);
        alert('Could not generate text. Please try again.');
    } finally {
        button.innerHTML = originalContent;
        button.classList.remove('loading');
        button.disabled = false;
        this.validateForm();
    }
  }

  private handleUpload() {
      if (!this.audioFile || !this.gifFile) {
          alert("Please select both an audio file and a GIF.");
          return;
      }
      
      this.setStatus('Combining files (simulation)... this may take a moment.');
      
      // Simulate video creation. In a real app, this would be a complex server-side process.
      // We will create a dummy video blob to upload to YouTube.
      const fakeVideoContent = `Audio: ${this.audioFile.name}, GIF: ${this.gifFile.name}`;
      const videoBlob = new Blob([fakeVideoContent], { type: 'video/mp4' });

      const metadata = {
          snippet: {
              title: this.titleInput.value,
              description: this.descriptionInput.value,
              tags: this.tagsInput.value.split(',').map(tag => tag.trim()),
          },
          status: {
              privacyStatus: (this.privacyOptions.querySelector('.active') as HTMLElement).dataset.value,
          },
      };

      this.uploadVideoToYouTube(videoBlob, metadata);
  }

  private uploadVideoToYouTube(videoFile: Blob, metadata: any) {
    const uploader = new (window as any).MediaUploader({
      baseUrl: 'https://www.googleapis.com/upload/youtube/v3/videos',
      file: videoFile,
      token: this.gapi.client.getToken().access_token,
      metadata: metadata,
      params: {
        part: Object.keys(metadata).join(','),
      },
      onError: (err: any) => {
        this.setStatus(`Upload failed: ${err}`, true);
        console.error(err);
      },
      onProgress: (event: any) => {
        const percent = Math.floor((event.loaded / event.total) * 100);
        this.setStatus(`Uploading to YouTube... ${percent}%`);
      },
      onComplete: (res: any) => {
        const result = JSON.parse(res);
        if (result.id) {
          const videoUrl = `https://www.youtube.com/watch?v=${result.id}`;
          this.setStatus(`Upload successful! <a href="${videoUrl}" target="_blank">View on YouTube</a>`);
        } else {
          this.setStatus(`Upload failed: ${result.error.message}`, true);
        }
      },
    });

    uploader.upload();
  }

  private setStatus(message: string, isError = false) {
    this.uploadStatus.innerHTML = message;
    this.uploadStatus.style.color = isError ? 'var(--error-color)' : 'var(--text-color)';
  }
}

// MediaUploader class is a helper for resumable uploads, adapted for this use case.
(window as any).MediaUploader = function(options: any) {
  const self = this;
  this.file = options.file;
  this.metadata = options.metadata;
  this.token = options.token;
  this.onComplete = options.onComplete || function() {};
  this.onProgress = options.onProgress || function() {};
  this.onError = options.onError || function() {};
  this.params = options.params || {};
  this.url = options.baseUrl;

  this.upload = function() {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', this.url + '?' + this.buildQuery(this.params), true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + this.token);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Upload-Content-Length', this.file.size);
    xhr.setRequestHeader('X-Upload-Content-Type', this.file.type);

    xhr.onload = (e: any) => {
      if (e.target.status < 400) {
        const location = e.target.getResponseHeader('Location');
        this.sendFile(location);
      } else {
        this.onError(e.target.response);
      }
    };
    xhr.onerror = (e: any) => this.onError(e.target.response);
    xhr.send(JSON.stringify(this.metadata));
  };
  
  this.sendFile = (location: string) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', location, true);
    xhr.setRequestHeader('Content-Type', this.file.type);
    xhr.setRequestHeader('X-Goog-Upload-Protocol', 'resumable');
    xhr.upload.onprogress = this.onProgress;
    xhr.onload = (e: any) => this.onComplete(e.target.response);
    xhr.onerror = (e: any) => this.onError(e.target.response);
    xhr.send(this.file);
  };
  
  this.buildQuery = (params: any) => {
      return Object.keys(params).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(params[key])).join('&');
  }
};


new TuneToTubeApp();
