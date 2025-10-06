const Shortcuts = Object.freeze({
    LABEL: "Hotkeys",
    DESCRIPTION: "The following is a list of pre-configured keyboard shortcuts for faster browser interactions using a programmable switch interface.",
    ACTIONS: {
        CLICK: {
            NAME: "click",
            LABEL: "Click",
            DESCRIPTION: "Performs a click action at the current mouse position.",
            HOTKEYS: "CommandOrControl+Alt+C",
        },
        TOGGLE_OMNI_BOX: {
            NAME: "toggleOmniBox",
            LABEL: "Open/Close Omni Box",
            DESCRIPTION: "Opens or closes the Omni Box, which allows you to enter a URL or search term.",
            HOTKEYS: "CommandOrControl+Alt+O",
        },
        TOGGLE_READ_MODE: {
            NAME: "toggleReadMode",
            LABEL: "Pause/Resume Reading Mode",
            DESCRIPTION: "Pauses or resumes reading mode.",
            HOTKEYS: "CommandOrControl+Alt+D",
        },
        ZOOM_IN: {
            NAME: "zoomIn",
            LABEL: "Zoom In",
            DESCRIPTION: "Zooms in on the current tab.",
            HOTKEYS: "CommandOrControl+Alt+Plus",
        },
        ZOOM_OUT: {
            NAME: "zoomOut",
            LABEL: "Zoom Out",
            DESCRIPTION: "Zooms out from the current tab.",
            HOTKEYS: "CommandOrControl+Alt+-",
        },
        SIDEBAR_SCROLL_UP: {
            NAME: "sidebarScrollUp",
            LABEL: "Sidebar Scroll Up",
            DESCRIPTION: "Scrolls up the sidebar menu.",
            HOTKEYS: "CommandOrControl+Alt+W",
        },
        SIDEBAR_SCROLL_DOWN: {
            NAME: "sidebarScrollDown",
            LABEL: "Sidebar Scroll Down",
            DESCRIPTION: "Scrolls down the sidebar menu.",
            HOTKEYS: "CommandOrControl+Alt+S",
        },
        NAVIGATE_FORWARD: {
            NAME: "navigateForward",
            LABEL: "Forward Navigation",
            DESCRIPTION: "Navigates forward in the tab history.",
            HOTKEYS: "CommandOrControl+Alt+Right",
        },
        NAVIGATE_BACK: {
            NAME: "navigateBack",
            LABEL: "Backward Navigation",
            DESCRIPTION: "Navigates backward in the tab history.",
            HOTKEYS: "CommandOrControl+Alt+Left",
        }
    }
});

const KeyboardLayouts = Object.freeze({
    ENGLISH: "en",
    FRENCH: "fr",
    ITALIAN: "it",
    MALTESE: "mt",
    NUMERIC: "numeric"
});

const Settings = Object.freeze({
    DWELL_TIME: {
        NAME: "dwellTime",
        LABEL: "General Dwelling Duration",
        DESCRIPTION: "The time in seconds that the cursor must remain over an item before it is selected. This duration is also used when using Quick Click.",
        VERY_SHORT: 800,
        SHORT: 900,
        NORMAL: 1000,
        LONG: 1200,
        VERY_LONG: 1500,
    },
    DWELL_RANGE: {
        NAME: "quickDwellRange",
        DEFAULT: 5
    },
    KEYBOARD_DWELL_TIME: {
        NAME: "keyboardDwellTime",
        LABEL: "Keyboard Key Dwelling Duration",
        DESCRIPTION: "The time in seconds that the cursor must remain over a keyboard key before it is selected.",
        VERY_SHORT: 800,
        SHORT: 900,
        NORMAL: 1000,
        LONG: 1200,
        VERY_LONG: 1500,
    },
    RANGE_WIDTH: {
        NAME: "dwellRangeWidth",
        DEFAULT: 150,
    },
    RANGE_HEIGHT: {
        NAME: "dwellRangeHeight",
        DEFAULT: 50,
    },
    TAB_VIEW_SCROLL_DISTANCE: {
        NAME: "tabViewScrollDistance",
        LABEL: "Web Page Scroll Speed",
        DESCRIPTION: "The speed at which the web page on every tab scrolls when using the arrow buttons.",
        SLOW: 100,
        NORMAL: 200,
        FAST: 300,
    },
    TAB_VIEW_SCROLL_INTERVAL_IN_MS: {
        NAME: "tabViewScrollIntervalInMs",
        DEFAULT: 300,
    },
    MENU_AREA_SCROLL_DISTANCE: {
        NAME: "menuAreaScrollDistance",
        LABEL: "Sidebar Scroll Speed",
        DESCRIPTION: "The speed at which the elements in the sidebar menu are scrolled when using the arrow buttons.",
        SLOW: 100,
        NORMAL: 200,
        FAST: 300,
    },
    MENU_AREA_SCROLL_INTERVAL_IN_MS: {
        NAME: "menuAreaScrollIntervalInMs",
        DEFAULT: 300,
    },
    USE_NAV_AREAS: {
        NAME: "useNavAreas",
        LABEL: "Menu Rendering",
        // LABEL: "Hierarchical Menu",
        DESCRIPTION: "Determines if the sidebar displays a hierarchical menu or individual elements. Enabling this option will show the menu hierarchy. This setting will apply to all open tabs.",
        DEFAULT: 1,
    },
    USE_ROBOT_JS: {
        NAME: "useRobotJS",
        // LABEL: "Link Interaction",
        // LABEL: "Link Clicking",
        LABEL: "Manual Link Interaction",
        DESCRIPTION: "Determines if the application will use the URL to navigate to a link, or if it will move the eye cursor on the link and click it manually. Enabling this option will use the manual clicking method on all open tabs.",
        DEFAULT: 1,
    },
    IS_READ_MODE_ACTIVE: {
        NAME: "isReadModeActive",
        DEFAULT: 0,
    },
    DEFAULT_URL: {
        NAME: "defaultUrl",
        LABEL: "Home Page",
        DESCRIPTION: "The URL that will be opened when the application starts and a new tab is opened.",
        DEFAULT: "https://www.google.com",
    },
    DEFAULT_LAYOUT: {
        NAME: "defaultLayout",
        LABEL: "Keyboard Language",
        DESCRIPTION: "The keyboard language that will be used as a default, unless it is changed from the keyboard itself.",
        DEFAULT: KeyboardLayouts.ENGLISH,
    },
    PREVIOUS_APP_VERSION: {
        NAME: "previousAppVersion",
        DEFAULT: "0.0.0",
    }
});

module.exports = {
    Settings,
    Shortcuts,
    KeyboardLayouts
};