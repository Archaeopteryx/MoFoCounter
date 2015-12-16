const Cc = Components.classes;
const Ci = Components.interfaces;
Components.utils.import("resource:///modules/CustomizableUI.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

var sound = Cc["@mozilla.org/sound;1"].createInstance(Ci.nsISound);
var soundUri = Cc['@mozilla.org/network/standard-url;1'].createInstance(Ci.nsIURI);
soundUri.spec = "chrome://mofofuraco/content/money.wav";

if (!Preferences.has("extensions.mofofuraco.moneySound"))
{
  Preferences.set("extensions.mofofuraco.moneySound", false);
}

var mofofuraco =
{
  amount: 0, // current amount of money donated
  isVisible: undefined,
  isVisibleDetected: false,
  timer: undefined, // Will hold the repeating update of the data

  tickerInterval: function()
  {
    if (!Preferences.has("extensions.mofofuraco.updateInterval.seconds"))
    {
      Preferences.set("extensions.mofofuraco.updateInterval.seconds", "");
    }
    let secondsPref = Preferences.get("extensions.mofofuraco.updateInterval.seconds");
    let seconds = Number.parseFloat(secondsPref);
    if (!Number.isNaN(seconds))
    {
      // 1 minute as default if the value stored in the seconds preferences is garbage.
      // Server caches data for 10 seconds, so no need to check more often.
      return seconds && (seconds >= 10) ? seconds * 1000 : 60 * 1000;
    }
    if (!Preferences.has("extensions.mofofuraco.updateInterval"))
    {
      Preferences.set("extensions.mofofuraco.updateInterval", 60);
    }
    // One hour should be fine for now
    return Preferences.get("extensions.mofofuraco.updateInterval", 60) * 60 * 1000;
  },

  timerObserver:
  {
    observe: function ()
    {
      mofofuraco.updateAmount();
    }
  },

  timerStart: function ()
  {
    mofofuraco.timer = Components.classes["@mozilla.org/timer;1"]
                                 .createInstance(Components.interfaces.nsITimer);
    mofofuraco.timer.init(mofofuraco.timerObserver,
                          mofofuraco.tickerInterval(),
                          Components.interfaces.nsITimer.TYPE_REPEATING_SLACK);
  },

  timerStop: function ()
  {
    if (mofofuraco.timer)
    {
      mofofuraco.timer.cancel();
    }
  },

  prefObserver:
  {
    register: function()
    {
      this.branch = Services.prefs.getBranch("extensions.mofofuraco.updateInterval");
      this.branch.addObserver("", mofofuraco.prefObserver, false);
    },

    unregister: function()
    {
      this.branch.removeObserver("", mofofuraco.prefObserver);
    },

    observe: function(aSubject, aTopic, aData) {
      mofofuraco.timer.cancel();
      mofofuraco.timer.init(mofofuraco.timerObserver,
                            mofofuraco.tickerInterval(),
                            Components.interfaces.nsITimer.TYPE_REPEATING_SLACK);
    }
  },

  checkVisibility: function(aWindow)
  {
    let button = aWindow.document.getElementById("mofofuraco-button");
    if (button)
    {
      mofofuraco.isVisible = true;
      mofofuraco.updateAmount();
      mofofuraco.timerStart();
    }
    else
    {
      mofofuraco.isVisible = false;
      mofofuraco.timerStop();
    }
    mofofuraco.isVisibleDetected = true;
  },

  buttonClicked: function (aEvent)
  {
    if (aEvent.button == 0)
    {
      aEvent.view.window.openUILinkIn("https://fundraising.mozilla.org", "current");
    }
    if (aEvent.button == 1)
    {
      aEvent.view.window.openUILinkIn("https://fundraising.mozilla.org", "tab");
    }
  },

  setupBrowserUI: function(aWindow) {
    let document = aWindow.document;

    // Take any steps to add UI or anything to the browser window
    // document.getElementById() etc. will work here
    if (!mofofuraco.isVisibleDetected)
    {
      mofofuraco.checkVisibility(aWindow);
    }
    if (mofofuraco.isVisible)
    {
      mofofuraco.updateAmount();
      let button = document.getElementById("mofofuraco-button");
      button.addEventListener("click", mofofuraco.buttonClicked);
    }
  },

  tearDownBrowserUI: function(aWindow) {
    let document = aWindow.document;

    // Take any steps to remove UI or anything from the browser window
    // document.getElementById() etc. will work here
    let button = document.getElementById("mofofuraco-button");
    if (button)
    {
      button.removeEventListener("click", mofofuraco.buttonClicked);
    }
  },

  setLabel: function(aWindow, aNewLabel)
  {
    let labelNode = aWindow.document.getElementById("mofofuraco-label");
    if (labelNode)
    {
      labelNode.setAttribute("value", aNewLabel);
    }
  },

  setTooltip: function(aWindow, aNewTooltip)
  {
    let buttonNode = aWindow.document.getElementById("mofofuraco-button");
    if (buttonNode)
    {
      buttonNode.setAttribute("tooltiptext", aNewTooltip);
    }
  },

  updateAmount: function()
  {
    let xhr = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
    xhr.open("GET", "https://d3gxuc3bq48qfa.cloudfront.net/eoy-2014-total", true);
    xhr.onerror = function(error)
    {
      console.error(error);
      mofofuraco.updateLabel("$?,???,???");
      mofofuraco.updateTooltip("An error occurred while fetching the data.");
    };
    xhr.onload = function()
    {
      if (xhr.status === 200)
      {
        try
        {
          let paypalData = JSON.parse(xhr.responseText);
          let previousAmount = mofofuraco.amount;
          mofofuraco.amount = Math.round(paypalData.sum);
          mofofuraco.updateLabelWithAmount();
          if ( Preferences.get("extensions.mofofuraco.moneySound") === true)
          {
            // Did we make another $100,000?
            if (previousAmount !== 0 &&
                Math.floor(previousAmount / 100000) < Math.floor(mofofuraco.amount / 100000))
            {
              sound.play(soundUri);
            }
          }
        }
        catch(e)
        {
          console.error(e);
          mofofuraco.updateLabel("$?,???,???");
          mofofuraco.updateTooltip("An error occurred: Invalid data");
        }
      }
    };
    xhr.overrideMimeType("application/json");
    xhr.send();
  },

  updateLabel: function(aNewLabel)
  {
    let windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements())
    {
      let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
      mofofuraco.setLabel(domWindow, aNewLabel);
    }
  },

  updateLabelWithAmount: function()
  {
    let numberFormat = new Intl.NumberFormat("en-US");
    let newLabel = "$" + numberFormat.format(mofofuraco.amount);
    mofofuraco.updateLabel(newLabel);
  },

  updateTooltip: function(aNewTooltip)
  {
    let windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements())
    {
      let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
      mofofuraco.setTooltip(domWindow, aNewTooltip);
    }
  }

};

var WindowListener = {
  // nsIWindowMediatorListener functions
  onOpenWindow: function(xulWindow) {
    let domWindow = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                             .getInterface(Ci.nsIDOMWindow);

    // Wait for it to finish loading
    domWindow.addEventListener("load", function listener() {
      domWindow.removeEventListener("load", listener, false);

      // If this is a browser window then setup its UI
      if (domWindow.document.documentElement.getAttribute("windowtype") == "navigator:browser")
        mofofuraco.setupBrowserUI(domWindow);
    }, false);
  },

  onCloseWindow: function(xulWindow) {},

  onWindowTitleChange: function(xulWindow, newTitle) {}
};

function startup(data, reason)
{
  CustomizableUI.createWidget(
  {
    id: 'mofofuraco-button', // shoukd match id in onBuild
    type: 'custom',
    defaultArea: CustomizableUI.AREA_NAVBAR,
    onBuild: function(aDocument)
    {
      var label = aDocument.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'label');
      label.setAttribute('id', 'mofofuraco-label');
      label.setAttribute('value', '$?,???,???');
      label.setAttribute('tooltiptext', "Amount of money fundraised by the Mozilla Foundation's End of Year campaign");

      var toolbaritem = aDocument.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'toolbaritem');
      // should match id in createWidget
      toolbaritem.setAttribute("id", "mofofuraco-button");
      toolbaritem.setAttribute("align", "center");
      toolbaritem.setAttribute("pack", "center");
      toolbaritem.classList.add("chromeclass-toolbar-additional");
      toolbaritem.classList.add("toolbaritem-combined-buttons");
      toolbaritem.classList.add("panel-wide-item");
      toolbaritem.appendChild(label);

      let listener =
      {
        onWidgetRemoved: function(aWidgetId, aPrevArea)
        {
          if (aWidgetId != "mofofuraco-button")
            return;
          mofofuraco.timerStop();
          mofofuraco.isVisible = false;
        },

        onCustomizeStart: function(aWindow)
        {
          if (aWindow.document == aDocument)
          {
            mofofuraco.updateLabel("Mozilla Fundraising Amount");
            if (mofofuraco.timer)
            {
              mofofuraco.timerStop();
            }
          }
        },

        onCustomizeEnd: function(aWindow) {
          if (aWindow.document == aDocument) {
            mofofuraco.checkVisibility(aWindow);
          }
        },
      };
      CustomizableUI.addListener(listener);

      return toolbaritem;
    }
  });

  // Get the list of browser windows already open
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements())
  {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    mofofuraco.setupBrowserUI(domWindow);
  }

  // Wait for any new browser windows to open
  Services.wm.addListener(WindowListener);
  mofofuraco.prefObserver.register();
}

function shutdown(data, reason)
{
  // When the application is shutting down we normally don't have to clean
  // up any UI changes made
  if (reason == APP_SHUTDOWN)
    return;

  mofofuraco.timerStop();

  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements())
  {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);

    mofofuraco.tearDownBrowserUI(domWindow);
  }

  CustomizableUI.destroyWidget("mofofuraco-button");
  Services.wm.removeListener(WindowListener);
  mofofuraco.prefObserver.unregister();
}

function install(data, reason)
{
}

function uninstall(data, reason)
{
  CustomizableUI.destroyWidget("mofofuraco-button");
}
