import { it, expect, describe, beforeEach, vi } from "vitest"
import { get, writable } from "svelte/store"
import { API } from "@/api"
import { Constants } from "@budibase/frontend-core"
import { componentStore, appStore, workspaceAppStore } from "@/stores/builder"
import { initialScreenState, ScreenStore } from "@/stores/builder/screens"
import {
  getScreenFixture,
  getComponentFixture,
  COMPONENT_DEFINITIONS,
  componentDefinitionMap,
  getScreenDocId,
  componentsToNested,
} from "./fixtures"

const COMP_PREFIX = "@budibase/standard-components"

vi.mock("@/stores/builder", async () => {
  const mockAppStore = writable()
  const mockComponentStore = writable()
  const mockLayoutStore = writable()

  const componentStore = {
    getDefinition: vi.fn(),
    enrichEmptySettings: vi.fn(),
    update: mockComponentStore.update,
    subscribe: mockComponentStore.subscribe,
  }

  const appStore = {
    subscribe: mockAppStore.subscribe,
    update: mockAppStore.update,
    set: mockAppStore.set,
    refresh: vi.fn(),
    refreshAppNav: vi.fn(),
  }

  const navigationStore = {
    deleteLink: vi.fn(),
  }

  const workspaceAppStore = {
    refresh: vi.fn(),
  }

  return {
    componentStore,
    appStore,
    navigationStore,
    layoutStore: {
      update: mockLayoutStore.update,
      subscribe: mockComponentStore.subscribe,
    },
    workspaceAppStore,
  }
})

vi.mock("@/stores/builder/components/utils", () => {
  return {
    findAllMatchingComponents: vi.fn().mockImplementation(() => {
      return []
    }),
  }
})

vi.mock("@/api", () => {
  return {
    API: {
      fetchAppPackage: vi.fn(),
      fetchAppRoutes: vi.fn(),
      saveScreen: vi.fn(),
      deleteScreen: vi.fn(),
    },
  }
})

describe("Screens store", () => {
  beforeEach(async ctx => {
    vi.clearAllMocks()

    const screenStore = new ScreenStore()
    ctx.bb = {
      get store() {
        return get(screenStore)
      },
      screenStore,
    }
  })

  it("Create base screen store with defaults", ({ bb }) => {
    expect(bb.store).toStrictEqual(initialScreenState)
  })

  it("Syncs all screens from the app package", ({ bb }) => {
    expect(bb.store.screens.length).toBe(0)

    const screens = Array(2)
      .fill()
      .map(() => getScreenFixture().json())

    bb.screenStore.syncAppScreens({ screens })

    expect(bb.store.screens).toStrictEqual(screens)
  })

  it("Reset the screen store back to the default state", ({ bb }) => {
    expect(bb.store.screens.length).toBe(0)

    const screens = Array(2)
      .fill()
      .map(() => getScreenFixture().json())

    bb.screenStore.syncAppScreens({ screens })
    expect(bb.store.screens).toStrictEqual(screens)

    bb.screenStore.update(state => ({
      ...state,
      selectedScreenId: screens[0]._id,
    }))

    bb.screenStore.reset()

    expect(bb.store).toStrictEqual(initialScreenState)
  })

  it("Marks a valid screen as selected", ({ bb }) => {
    const screens = Array(2)
      .fill()
      .map(() => getScreenFixture().json())

    bb.screenStore.syncAppScreens({ screens })
    expect(bb.store.screens.length).toBe(2)

    bb.screenStore.select(screens[0]._id)

    expect(bb.store.selectedScreenId).toEqual(screens[0]._id)
  })

  it("Skip selecting a screen if it is not present", ({ bb }) => {
    const screens = Array(2)
      .fill()
      .map(() => getScreenFixture().json())

    bb.screenStore.syncAppScreens({ screens })
    expect(bb.store.screens.length).toBe(2)

    bb.screenStore.select("screen_abc")

    expect(bb.store.selectedScreenId).toBeUndefined()
  })

  it("Approve a valid empty screen config", ({ bb }) => {
    const coreScreen = getScreenFixture()
    bb.screenStore.validate(coreScreen.json())
  })

  it("Approve a valid screen config with one component and no illegal children", ({
    bb,
  }) => {
    const coreScreen = getScreenFixture()
    const formBlock = getComponentFixture(`${COMP_PREFIX}/formblock`)

    coreScreen.addChild(formBlock)

    const defSpy = vi.spyOn(componentStore, "getDefinition")
    defSpy.mockReturnValueOnce(COMPONENT_DEFINITIONS.formblock)

    bb.screenStore.validate(coreScreen.json())

    expect(defSpy).toHaveBeenCalled()
  })

  it("Reject an attempt to nest invalid components", ({ bb }) => {
    const coreScreen = getScreenFixture()

    const formOne = getComponentFixture(`${COMP_PREFIX}/form`)
    const formTwo = getComponentFixture(`${COMP_PREFIX}/form`)

    formOne.addChild(formTwo)
    coreScreen.addChild(formOne)

    const defSpy = vi
      .spyOn(componentStore, "getDefinition")
      .mockImplementation(comp => {
        const defMap = componentDefinitionMap()
        return defMap[comp]
      })

    expect(() => bb.screenStore.validate(coreScreen.json())).toThrowError(
      `You can't place a ${COMPONENT_DEFINITIONS.form.name} here`
    )

    expect(defSpy).toHaveBeenCalled()
  })

  it("Reject an attempt to deeply nest invalid components", ({ bb }) => {
    const coreScreen = getScreenFixture()

    const formOne = getComponentFixture(`${COMP_PREFIX}/form`)
    const formTwo = getComponentFixture(`${COMP_PREFIX}/form`)

    const components = Array(10)
      .fill()
      .map(() => getComponentFixture(`${COMP_PREFIX}/container`))

    components.splice(5, 0, formOne)
    components.push(formTwo)

    //Take the array and turn it into a deeply nested tree
    let nested = componentsToNested(components)

    coreScreen.addChild(nested)

    const defSpy = vi
      .spyOn(componentStore, "getDefinition")
      .mockImplementation(comp => {
        const defMap = componentDefinitionMap()
        return defMap[comp]
      })

    expect(() => bb.screenStore.validate(coreScreen.json())).toThrowError(
      `You can't place a ${COMPONENT_DEFINITIONS.form.name} here`
    )

    expect(defSpy).toHaveBeenCalled()
  })

  it("Save a brand new screen and add it to the store. No validation", async ({
    bb,
  }) => {
    const coreScreen = getScreenFixture()
    const formOne = getComponentFixture(`${COMP_PREFIX}/form`)

    coreScreen.addChild(formOne)

    appStore.set({ features: { componentValidation: false } })

    expect(bb.store.screens.length).toBe(0)

    const newDocId = getScreenDocId()
    const newDoc = { ...coreScreen.json(), _id: newDocId }

    // We dont care for this test
    const saveSpy = vi.spyOn(API, "saveScreen").mockResolvedValue(newDoc)
    vi.spyOn(API, "fetchAppRoutes").mockResolvedValue({
      routes: [],
    })
    await bb.screenStore.save(coreScreen.json())

    expect(saveSpy).toHaveBeenCalled()

    expect(bb.store.screens.length).toBe(1)

    expect(bb.store.screens[0]).toStrictEqual({
      ...newDoc,
    })

    expect(bb.store.selectedScreenId).toBe(newDocId)

    // The new screen should be selected
    expect(get(componentStore).selectedComponentId).toBe(
      coreScreen.json().props._id
    )
  })

  it("Sync an updated screen to the screen store on save", async ({ bb }) => {
    const existingScreens = Array(4)
      .fill()
      .map(() => {
        const screenDoc = getScreenFixture()
        const existingDocId = getScreenDocId()
        screenDoc._json._id = existingDocId
        return screenDoc
      })

    bb.screenStore.update(state => ({
      ...state,
      screens: existingScreens.map(screen => screen.json()),
    }))

    // Modify the fixture screen
    const form = getComponentFixture(`${COMP_PREFIX}/form`)
    existingScreens[2].addChild(form)

    const saveSpy = vi
      .spyOn(API, "saveScreen")
      .mockResolvedValue(existingScreens[2].json())

    // Saved the existing screen having modified it.
    await bb.screenStore.save(existingScreens[2].json())

    expect(appStore.refreshAppNav).toHaveBeenCalledOnce()
    expect(saveSpy).toHaveBeenCalled()

    // On save, the screen is spliced back into the store with the saved content
    expect(bb.store.screens[2]).toStrictEqual(existingScreens[2].json())
  })

  it("Proceed to patch if appropriate config are supplied", async ({ bb }) => {
    vi.spyOn(bb.screenStore, "sequentialScreenPatch").mockImplementation(() => {
      return false
    })
    const noop = () => {}

    await bb.screenStore.patch(noop, "test")
    expect(bb.screenStore.sequentialScreenPatch).toHaveBeenCalledWith(
      noop,
      "test"
    )
  })

  it("Return from the patch if all valid config are not present", async ({
    bb,
  }) => {
    vi.spyOn(bb.screenStore, "sequentialScreenPatch")
    await bb.screenStore.patch()
    expect(bb.screenStore.sequentialScreenPatch).not.toBeCalled()
  })

  it("Acquire the currently selected screen on patch, if not specified", async ({
    bb,
  }) => {
    vi.spyOn(bb.screenStore, "sequentialScreenPatch")
    await bb.screenStore.patch()

    const noop = () => {}
    bb.screenStore.update(state => ({
      ...state,
      selectedScreenId: "screen_123",
    }))

    await bb.screenStore.patch(noop)
    expect(bb.screenStore.sequentialScreenPatch).toHaveBeenCalledWith(
      noop,
      "screen_123"
    )
  })

  // Used by the websocket
  it("Ignore a call to replace if no screenId is provided", ({ bb }) => {
    const existingScreens = Array(4)
      .fill()
      .map(() => {
        const screenDoc = getScreenFixture()
        const existingDocId = getScreenDocId()
        screenDoc._json._id = existingDocId
        return screenDoc.json()
      })
    bb.screenStore.syncAppScreens({ screens: existingScreens })

    bb.screenStore.replace()

    expect(bb.store.screens).toStrictEqual(existingScreens)
  })

  it("Remove a screen from the store if a single screenId is supplied", ({
    bb,
  }) => {
    const existingScreens = Array(4)
      .fill()
      .map(() => {
        const screenDoc = getScreenFixture()
        const existingDocId = getScreenDocId()
        screenDoc._json._id = existingDocId
        return screenDoc.json()
      })
    bb.screenStore.syncAppScreens({ screens: existingScreens })

    bb.screenStore.replace(existingScreens[1]._id)

    const filtered = existingScreens.filter(
      screen => screen._id != existingScreens[1]._id
    )
    expect(bb.store.screens).toStrictEqual(filtered)
  })

  it("Replace an existing screen with a new version of itself", ({ bb }) => {
    const existingScreens = Array(4)
      .fill()
      .map(() => {
        const screenDoc = getScreenFixture()
        const existingDocId = getScreenDocId()
        screenDoc._json._id = existingDocId
        return screenDoc
      })

    bb.screenStore.update(state => ({
      ...state,
      screens: existingScreens.map(screen => screen.json()),
    }))

    const formBlock = getComponentFixture(`${COMP_PREFIX}/formblock`)
    existingScreens[2].addChild(formBlock)

    bb.screenStore.replace(existingScreens[2]._id, existingScreens[2].json())

    expect(bb.store.screens.length).toBe(4)
  })

  it("Add a screen when attempting to replace one not present in the store", ({
    bb,
  }) => {
    const existingScreens = Array(4)
      .fill()
      .map(() => {
        const screenDoc = getScreenFixture()
        const existingDocId = getScreenDocId()
        screenDoc._json._id = existingDocId
        return screenDoc
      })

    bb.screenStore.update(state => ({
      ...state,
      screens: existingScreens.map(screen => screen.json()),
    }))

    const newScreenDoc = getScreenFixture()
    newScreenDoc._json._id = getScreenDocId()

    bb.screenStore.replace(newScreenDoc._json._id, newScreenDoc.json())

    expect(bb.store.screens.length).toBe(5)
    expect(bb.store.screens[4]).toStrictEqual(newScreenDoc.json())
  })

  it("Delete a single screen and remove it from the store", async ({ bb }) => {
    const existingScreens = Array(3)
      .fill()
      .map(() => {
        const screenDoc = getScreenFixture()
        const existingDocId = getScreenDocId()
        screenDoc._json._id = existingDocId
        return screenDoc
      })

    bb.screenStore.update(state => ({
      ...state,
      screens: existingScreens.map(screen => screen.json()),
    }))

    const deleteSpy = vi.spyOn(API, "deleteScreen")
    const refreshWorkspaceAppSpy = vi.spyOn(workspaceAppStore, "refresh")

    await bb.screenStore.delete(existingScreens[2].json())

    vi.spyOn(API, "fetchAppRoutes").mockResolvedValue({
      routes: [],
    })

    expect(deleteSpy).toBeCalled()
    expect(refreshWorkspaceAppSpy).toHaveBeenCalledOnce()

    expect(bb.store.screens.length).toBe(2)

    // Just confirm that the routes at are being initialised
    expect(get(appStore).routes).toEqual([])
  })

  it("Upon delete, reset selected screen and component ids if the screen was selected", async ({
    bb,
  }) => {
    const existingScreens = Array(3)
      .fill()
      .map(() => {
        const screenDoc = getScreenFixture()
        const existingDocId = getScreenDocId()
        screenDoc._json._id = existingDocId
        return screenDoc
      })

    bb.screenStore.update(state => ({
      ...state,
      screens: existingScreens.map(screen => screen.json()),
      selectedScreenId: existingScreens[2]._json._id,
    }))

    componentStore.update(state => ({
      ...state,
      selectedComponentId: existingScreens[2]._json._id,
    }))

    await bb.screenStore.delete(existingScreens[2].json())

    expect(bb.store.screens.length).toBe(2)
    expect(get(componentStore).selectedComponentId).toBeUndefined()
    expect(bb.store.selectedScreenId).toBeUndefined()
  })

  it("Delete multiple is not supported and should leave the store unchanged", async ({
    bb,
  }) => {
    const existingScreens = Array(3)
      .fill()
      .map(() => {
        const screenDoc = getScreenFixture()
        const existingDocId = getScreenDocId()
        screenDoc._json._id = existingDocId
        return screenDoc
      })

    const storeScreens = existingScreens.map(screen => screen.json())

    bb.screenStore.update(state => ({
      ...state,
      screens: existingScreens.map(screen => screen.json()),
    }))

    const targets = [storeScreens[1], storeScreens[2]]

    const deleteSpy = vi.spyOn(API, "deleteScreen")

    await bb.screenStore.delete(targets)

    expect(deleteSpy).not.toHaveBeenCalled()
    expect(bb.store.screens.length).toBe(3)
    expect(bb.store.screens).toStrictEqual(storeScreens)
  })

  it("Update a screen setting", async ({ bb }) => {
    const screenDoc = getScreenFixture()
    const existingDocId = getScreenDocId()
    screenDoc._json._id = existingDocId

    await bb.screenStore.update(state => ({
      ...state,
      screens: [screenDoc.json()],
    }))

    const patchedDoc = screenDoc.json()
    const patchSpy = vi
      .spyOn(bb.screenStore, "patch")
      .mockImplementation(async patchFn => {
        patchFn(patchedDoc)
        return
      })

    await bb.screenStore.updateSetting(patchedDoc, "showNavigation", false)

    expect(patchSpy).toBeCalled()
    expect(patchedDoc.showNavigation).toBe(false)
  })

  it("Ensure only one homescreen per role after updating setting. All screens same role", async ({
    bb,
  }) => {
    const existingScreens = Array(3)
      .fill()
      .map(() => {
        const screenDoc = getScreenFixture()
        const existingDocId = getScreenDocId()
        screenDoc._json._id = existingDocId
        return screenDoc
      })

    const storeScreens = existingScreens
      .map(screen => screen.json())
      .filter(screen => screen.routing.roleId == Constants.Roles.BASIC)

    // All default screens have the BASIC role
    expect(storeScreens.length).toBe(3)

    // Set the 2nd screen as the home screen
    storeScreens[1].routing.homeScreen = true

    await bb.screenStore.update(state => ({
      ...state,
      screens: storeScreens,
    }))

    vi.spyOn(bb.screenStore, "patch").mockImplementation(
      async (patchFn, screenId) => {
        const target = bb.store.screens.find(screen => screen._id === screenId)
        patchFn(target)

        await bb.screenStore.replace(screenId, target)
      }
    )

    await bb.screenStore.updateSetting(
      storeScreens[0],
      "routing.homeScreen",
      true
    )

    // The new homescreen for BASIC
    expect(bb.store.screens[0].routing.homeScreen).toBe(true)

    // The previous home screen for the BASIC role is now unset
    expect(bb.store.screens[1].routing.homeScreen).toBe(false)
  })

  it("Ensure only one homescreen per role when updating screen setting. Multiple screen roles", async ({
    bb,
  }) => {
    const expectedRoles = [
      Constants.Roles.BASIC,
      Constants.Roles.POWER,
      Constants.Roles.PUBLIC,
      Constants.Roles.ADMIN,
    ]

    // Build 12 screens, 3 of each role
    const existingScreens = Array(12)
      .fill()
      .map((_, idx) => {
        const screenDoc = getScreenFixture()
        screenDoc.role(expectedRoles[idx % 4])

        const existingDocId = getScreenDocId()
        screenDoc._json._id = existingDocId
        return screenDoc
      })

    const sorted = existingScreens
      .map(screen => screen.json())
      .sort((a, b) => a.routing.roleId.localeCompare(b.routing.roleId))

    // ADMIN
    sorted[0].routing.homeScreen = true
    // BASIC
    sorted[4].routing.homeScreen = true
    // PUBLIC
    sorted[9].routing.homeScreen = true

    // Set screens state
    await bb.screenStore.update(state => ({
      ...state,
      screens: sorted,
    }))

    vi.spyOn(bb.screenStore, "patch").mockImplementation(
      async (patchFn, screenId) => {
        const target = bb.store.screens.find(screen => screen._id === screenId)
        patchFn(target)

        await bb.screenStore.replace(screenId, target)
      }
    )

    // ADMIN homeScreen updated from 0 to 2
    await bb.screenStore.updateSetting(sorted[2], "routing.homeScreen", true)

    const results = bb.store.screens.reduce((acc, screen) => {
      if (screen.routing.homeScreen) {
        acc[screen.routing.roleId] = acc[screen.routing.roleId] || []
        acc[screen.routing.roleId].push(screen)
      }
      return acc
    }, {})

    const screens = bb.store.screens
    // Should still only be one of each homescreen
    expect(results[Constants.Roles.ADMIN].length).toBe(1)
    expect(screens[2].routing.homeScreen).toBe(true)

    expect(results[Constants.Roles.BASIC].length).toBe(1)
    expect(screens[4].routing.homeScreen).toBe(true)

    expect(results[Constants.Roles.PUBLIC].length).toBe(1)
    expect(screens[9].routing.homeScreen).toBe(true)

    // Homescreen was never set for POWER
    expect(results[Constants.Roles.POWER]).not.toBeDefined()
  })

  it("Sequential patch check. Exit if the screenId is not valid.", async ({
    bb,
  }) => {
    const screenDoc = getScreenFixture()
    const existingDocId = getScreenDocId()
    screenDoc._json._id = existingDocId

    const original = screenDoc.json()

    await bb.screenStore.update(state => ({
      ...state,
      screens: [original],
    }))

    const saveSpy = vi
      .spyOn(bb.screenStore, "save")
      .mockImplementation(async () => {
        return
      })

    // A screen with this Id does not exist
    await bb.screenStore.sequentialScreenPatch(() => {}, "123")
    expect(saveSpy).not.toBeCalled()
  })

  it("Sequential patch check. Exit if the patchFn result is false", async ({
    bb,
  }) => {
    const screenDoc = getScreenFixture()
    const existingDocId = getScreenDocId()
    screenDoc._json._id = existingDocId

    const original = screenDoc.json()
    // Set screens state
    await bb.screenStore.update(state => ({
      ...state,
      screens: [original],
    }))

    const saveSpy = vi
      .spyOn(bb.screenStore, "save")
      .mockImplementation(async () => {
        return
      })

    // Returning false from the patch will abort the save
    await bb.screenStore.sequentialScreenPatch(() => {
      return false
    }, "123")

    expect(saveSpy).not.toBeCalled()
  })

  it("Sequential patch check. Patch applied and save requested", async ({
    bb,
  }) => {
    const screenDoc = getScreenFixture()
    const existingDocId = getScreenDocId()
    screenDoc._json._id = existingDocId

    const original = screenDoc.json()

    await bb.screenStore.update(state => ({
      ...state,
      screens: [original],
    }))

    const saveSpy = vi
      .spyOn(bb.screenStore, "save")
      .mockImplementation(async () => {
        return
      })

    await bb.screenStore.sequentialScreenPatch(screen => {
      screen.name = "updated"
    }, existingDocId)

    expect(saveSpy).toBeCalledWith({
      ...original,
      name: "updated",
    })
  })
})
