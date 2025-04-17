# Now Playing

Now Playing is a webpage widget that tracks and visualizes what's playing on Spotify.

Initially adapted from [Adar's Now Playing](https://github.com/adarhef/NowPlaying), my version fixes various issues with reliability, and added video canvas support.
It also does not require Snip as it's bundled with [Spotilocal](https://github.com/jmswrnr/spotilocal) and [Simple Web Server](https://github.com/terreng/simple-web-server)

## Installation

Download the latest release from the Releases page and extract it somewhere.

* Set up Spotilocal: 
    * Navigate to the extracted folder and run `Spotilocal-vX.X.XX.exe`.
    * Right click the tray icon, make sure `Large Image`, `Empty content files when paused`, `Save JSON state file`, `Save track history`, and `Enable web widget` are enabled.
      
* Set up Simple Web Server:
    * Navigate to the extracted folder, run and install `Simple-Web-Server-Installer-X.X.XX.exe`
    * Once installed set the path to the extracted folder, for example: `C:\Users\Manny\Downloads\NowPlaying`
    * Turn on `Accessible on local network`
    * Copy the URL

* Set up a Browser Source in OBS: 
    * Set the size to 300 height and 1500 width, and put it in the bottom left of your scene. 
    * Paste the URL you got from Simple Web Server.

And that's it, it's that easy!


## Notes

If you want a solution for macOS, check out [NowPlayingRetreiver](https://github.com/adarhef/NowPlayingRetriever). Sadly it can't be used with this widget.

## Contributing

Pull requests are more than welcome to address any issue you see and expand on this project further. It'd be best to discuss your ideas in an Issue first though.


## License
[MIT](https://choosealicense.com/licenses/mit/)
