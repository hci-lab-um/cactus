

<div style="text-align: center;">
    <img src="app/resources/logo.ico" alt="CACTUS Icon" width="70" height="70">
    <h1>CACTUS Eye Browser – Setup Guide</h1>
</div>

Welcome to CACTUS – an accessible browser for users who rely on eye-tracking and alternative input devices. This guide outlines the required settings and software configurations to use CACTUS effectively across various platforms and devices.


## Installation

There are two ways to get started.

### Download and install the latest release 

[Download latest release](https://github.com/hci-lab-um/cactus/releases)

### Download code and build 

20.11.1 <= Node Version < 21 (It cannot be used with versions later than 20 because node-sass is depricated)
```
1. Download and install node
2. `cd` into repository
3. Run `npm install`
4. Run `npm install -g gulp`
5. Run `npm rebuild node-sass`
6. Run `npm rebuild electron`
```

You may create a binary for your platform by calling 

`npm run dist`

#### Running

1. If you have the executable: look under the 'dist' folder
2. Alternatively use ```npm run start``` from your commmand line

## People

- [Chris Porter](https://www.um.edu.mt/profile/chrisporter)
- [Daniel Vella](https://www.linkedin.com/in/velladaniel/)
- [Marie Buhagiar](https://www.linkedin.com/in/marie-buhagiar-283155267/)
- [Daniel Calleja](https://www.linkedin.com/in/daniel-calleja-2a9670240/)

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License
[GPL3](https://www.gnu.org/licenses/gpl-3.0.en.html)

## Setup and Usage Instructions

- Ensure your eye tracker or pointer device is properly calibrated.
- Open CACTUS using your preferred method (e.g. desktop shortcut, pinned taskbar).
- For pointer-based control (e.g. using eyes or head), make sure a system-wide pointer movement tool is active and configured (explained below).

---
## Tobii and Tobii Dynavox

### Windows Control (MyTobiiDynavox)

> Required for: Tobii Dynavox I-Series, PCEye, or similar devices using **Windows Control**.

#### Setup Steps:
1. Open **Settings** > **Taskbar**.
2. Add the **Move Cursor** task to the taskbar:
   - Click on the **Change** button of **Tasks**.
   - Tick the checkbox next to the **Move Cursor** if not already selected.
3. Navigate to the **Selection** tab.
4. Enable **Tertiary Selection** by ticking the checkbox.

#### After Setup:
- Open CACTUS.
- Activate **Sticky Move Cursor** using Tertiary Selection (visit the Tutorial from the Settings for guidance).
- You can now browse using eye-based pointer and dwell selection.


### Classic Tobii Gaze Interaction Software

> Legacy software used with older Tobii devices.

- Enable mouse emulation within the Gaze Interaction settings.
- Launch CACTUS once gaze-to-pointer is active.


### TD Control (Tobii Dynavox)

> ⚠️ Does **not** support mouse pointer movement directly.

#### Workaround:
- To use CACTUS, switch to **Gaze Point**:
  1. Close TD Control.
  2. Open **Gaze Point** software (enables gaze-controlled mouse movement).
  3. Use CACTUS as normal.
  4. When done, close Gaze Point and reopen TD Control to return to AAC use.


### Gaze Point (Standalone)

- Launch **Gaze Point**.
- Ensure the pointer control is working.
- Open CACTUS and use it with gaze control.

---

## GazePoint GP3

- Use third-party applications built with the **GP3 SDK** to enable pointer control.
- Once enabled, open CACTUS and begin navigation.

---

## Pupil Labs – Pupil Core

- Requires third-party software built on the **Pupil Core SDK**.
- Make sure pointer control is active through your application.
- Launch CACTUS for interaction.

---

## IrisBond Hiru

> Pointer control feature not yet tested with CACTUS.

- Built-in pointer control is available in some configurations.
- Users may attempt to use CACTUS with pointer enabled and report back on functionality.

---

## EyeTech Digital Systems

- Pointer control is available through:
  - **EyeOn**
  - **QuickACCESS**
  - Third-party applications (SDK required)

> Note: These configurations are **not fully tested**. Use at your own discretion.

---

## Quha Zono (Head Mouse)

- Works out of the box.
- No extra setup required for pointer movement.
- Simply open CACTUS and use as with a standard mouse.

---

## Experimental and Not Yet Tested

Some devices or software have not yet been fully tested with CACTUS. If you attempt to use CACTUS with these and encounter issues, please [open an issue](https://github.com/hci-lab-um/cactus/issues) or contact the development team.

---

## 💡 Troubleshooting

- If the pointer is not moving: Confirm that your pointer control software is active and not blocked by other applications. Ensure tertiary selection is enabled (when using Windows Control).
- CACTUS is unresponsive: Try restarting the browser and pointer control software.
- Eye tracker not detected: Verify hardware connection, calibration, and system permissions.

---

## 🆘 Need Help?

If you're unsure how to configure your system or need help with setup, feel free to:
- Open an issue in this repository
- Contact the support team on: [cactus@um.edu.mt](mailto:cactus@um.edu.mt)

---

Happy browsing with CACTUS! 🌵
