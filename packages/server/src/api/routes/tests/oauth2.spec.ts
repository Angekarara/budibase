import {
  DocumentType,
  InsertOAuth2ConfigRequest,
  OAuth2ConfigResponse,
  OAuth2CredentialsMethod,
  OAuth2GrantType,
  PASSWORD_REPLACEMENT,
} from "@budibase/types"
import * as setup from "./utilities"
import { generator } from "@budibase/backend-core/tests"
import _ from "lodash/fp"
import nock from "nock"

describe("/oauth2", () => {
  let config = setup.getConfig()

  function makeOAuth2Config({
    scope,
  }: { scope?: string } = {}): InsertOAuth2ConfigRequest {
    const config = {
      name: generator.guid(),
      url: generator.url(),
      clientId: generator.guid(),
      clientSecret: generator.hash(),
      method: generator.pickone(Object.values(OAuth2CredentialsMethod)),
      grantType: generator.pickone(Object.values(OAuth2GrantType)),
      scope,
    }
    return config
  }

  beforeAll(async () => await config.init())

  beforeEach(async () => {
    await config.newTenant()
    nock.cleanAll()
  })

  const expectOAuth2ConfigId = expect.stringMatching(
    `^${DocumentType.OAUTH2_CONFIG}_.+$`
  )

  describe("fetch", () => {
    it("returns empty when no oauth are created", async () => {
      const response = await config.api.oauth2.fetch()
      expect(response).toEqual({
        configs: [],
      })
    })

    it("returns all created configs", async () => {
      const existingConfigs = []
      for (let i = 0; i < 10; i++) {
        const oauth2Config = makeOAuth2Config()
        const result = await config.api.oauth2.create(oauth2Config)
        existingConfigs.push(result.config)
      }

      const response = await config.api.oauth2.fetch()
      expect(response.configs).toHaveLength(existingConfigs.length)
      expect(response).toEqual({
        configs: expect.arrayContaining(
          existingConfigs.map(c => ({
            _id: c._id,
            _rev: c._rev,
            name: c.name,
            url: c.url,
            clientId: c.clientId,
            clientSecret: PASSWORD_REPLACEMENT,
            method: c.method,
            grantType: c.grantType,
          }))
        ),
      })
    })
  })

  describe("create", () => {
    it("can create a new configuration", async () => {
      const oauth2Config = makeOAuth2Config()
      await config.api.oauth2.create(oauth2Config, { status: 201 })

      const response = await config.api.oauth2.fetch()
      expect(response).toEqual({
        configs: [
          {
            _id: expectOAuth2ConfigId,
            _rev: expect.stringMatching(/^1-\w+/),
            name: oauth2Config.name,
            url: oauth2Config.url,
            clientId: oauth2Config.clientId,
            clientSecret: PASSWORD_REPLACEMENT,
            method: oauth2Config.method,
            grantType: oauth2Config.grantType,
          },
        ],
      })
    })

    it("can create multiple configurations", async () => {
      const oauth2Config = makeOAuth2Config()
      const oauth2Config2 = makeOAuth2Config()
      await config.api.oauth2.create(oauth2Config, { status: 201 })
      await config.api.oauth2.create(oauth2Config2, { status: 201 })

      const response = await config.api.oauth2.fetch()
      expect(response.configs).toEqual(
        expect.arrayContaining([
          {
            _id: expectOAuth2ConfigId,
            _rev: expect.stringMatching(/^1-\w+/),
            name: oauth2Config.name,
            url: oauth2Config.url,
            clientId: oauth2Config.clientId,
            clientSecret: PASSWORD_REPLACEMENT,
            method: oauth2Config.method,
            grantType: oauth2Config.grantType,
          },
          {
            _id: expectOAuth2ConfigId,
            _rev: expect.stringMatching(/^1-\w+/),
            name: oauth2Config2.name,
            url: oauth2Config2.url,
            clientId: oauth2Config2.clientId,
            clientSecret: PASSWORD_REPLACEMENT,
            method: oauth2Config2.method,
            grantType: oauth2Config2.grantType,
          },
        ])
      )
      expect(response.configs[0]._id).not.toEqual(response.configs[1]._id)
    })

    it("cannot create configurations with already existing names", async () => {
      const oauth2Config = makeOAuth2Config()
      const oauth2Config2 = { ...makeOAuth2Config(), name: oauth2Config.name }
      await config.api.oauth2.create(oauth2Config, { status: 201 })
      await config.api.oauth2.create(oauth2Config2, {
        status: 400,
        body: {
          message: `OAuth2 config with name '${oauth2Config.name}' is already taken.`,
          status: 400,
        },
      })

      const response = await config.api.oauth2.fetch()
      expect(response.configs).toEqual([
        {
          _id: expectOAuth2ConfigId,
          _rev: expect.stringMatching(/^1-\w+/),
          name: oauth2Config.name,
          url: oauth2Config.url,
          clientId: oauth2Config.clientId,
          clientSecret: PASSWORD_REPLACEMENT,
          method: oauth2Config.method,
          grantType: oauth2Config.grantType,
        },
      ])
    })

    it("can create a configuration with scope", async () => {
      const scope = "read:users write:users"
      const oauth2Config = makeOAuth2Config({ scope })
      await config.api.oauth2.create(oauth2Config, { status: 201 })

      const response = await config.api.oauth2.fetch()
      expect(response).toEqual({
        configs: [
          {
            _id: expectOAuth2ConfigId,
            _rev: expect.stringMatching(/^1-\w+/),
            name: oauth2Config.name,
            url: oauth2Config.url,
            clientId: oauth2Config.clientId,
            clientSecret: PASSWORD_REPLACEMENT,
            method: oauth2Config.method,
            grantType: oauth2Config.grantType,
            scope,
          },
        ],
      })
    })
  })

  describe("update", () => {
    let existingConfigs: OAuth2ConfigResponse[] = []

    beforeEach(async () => {
      existingConfigs = []
      for (let i = 0; i < 10; i++) {
        const oauth2Config = makeOAuth2Config()
        const result = await config.api.oauth2.create(oauth2Config)

        existingConfigs.push(result.config)
      }
    })

    it("can update an existing configuration", async () => {
      const configData = _.sample(existingConfigs)!

      await config.api.oauth2.update({
        ...configData,
        name: "updated name",
      })

      const response = await config.api.oauth2.fetch()
      expect(response.configs).toHaveLength(existingConfigs.length)
      expect(response.configs).toEqual(
        expect.arrayContaining([
          {
            _id: configData._id,
            _rev: expect.not.stringMatching(configData._rev),
            name: "updated name",
            url: configData.url,
            clientId: configData.clientId,
            clientSecret: PASSWORD_REPLACEMENT,
            method: configData.method,
            grantType: configData.grantType,
          },
        ])
      )
    })

    it("throw if config not found", async () => {
      const toUpdate = {
        ...makeOAuth2Config(),
        _id: "unexisting",
        _rev: "unexisting",
      }
      await config.api.oauth2.update(toUpdate, {
        status: 404,
        body: { message: "OAuth2 config with id 'unexisting' not found." },
      })
    })

    it("throws if trying to use an existing name", async () => {
      const [config1, config2] = _.sampleSize(2, existingConfigs)

      await config.api.oauth2.update(
        {
          ...config1,
          name: config2.name,
        },
        {
          status: 400,
          body: {
            message: `OAuth2 config with name '${config2.name}' is already taken.`,
          },
        }
      )
    })

    it("can update a configuration to add scope", async () => {
      const configData = _.sample(existingConfigs)!
      const newScope = "read:data write:data"

      await config.api.oauth2.update({
        ...configData,
        scope: newScope,
      })

      const response = await config.api.oauth2.fetch()
      expect(response.configs).toEqual(
        expect.arrayContaining([
          {
            _id: configData._id,
            _rev: expect.not.stringMatching(configData._rev),
            name: configData.name,
            url: configData.url,
            clientId: configData.clientId,
            clientSecret: PASSWORD_REPLACEMENT,
            method: configData.method,
            grantType: configData.grantType,
            scope: newScope,
          },
        ])
      )
    })

    it("can update a configuration to remove scope", async () => {
      const configWithScope = makeOAuth2Config({
        scope: "read:users write:users",
      })
      const createdConfig = await config.api.oauth2.create(configWithScope)

      const { scope, ...configWithoutScope } = createdConfig.config
      await config.api.oauth2.update(configWithoutScope)

      const response = await config.api.oauth2.fetch()
      const updatedConfig = response.configs.find(
        c => c._id === createdConfig.config._id
      )
      expect(updatedConfig).not.toHaveProperty("scope")
    })

    it("can update a configuration to modify existing scope", async () => {
      const configWithScope = makeOAuth2Config({
        scope: "read:users write:users",
      })
      const createdConfig = await config.api.oauth2.create(configWithScope)

      const newScope = "admin:all"
      await config.api.oauth2.update({
        ...createdConfig.config,
        scope: newScope,
      })

      const response = await config.api.oauth2.fetch()
      const updatedConfig = response.configs.find(
        c => c._id === createdConfig.config._id
      )
      expect(updatedConfig?.scope).toBe(newScope)
    })
  })

  describe("delete", () => {
    let existingConfigs: OAuth2ConfigResponse[] = []

    beforeEach(async () => {
      existingConfigs = []
      for (let i = 0; i < 5; i++) {
        const oauth2Config = makeOAuth2Config()
        const result = await config.api.oauth2.create(oauth2Config)

        existingConfigs.push(result.config)
      }
    })

    it("can delete an existing configuration", async () => {
      const configToDelete = _.sample(existingConfigs)!

      await config.api.oauth2.delete(configToDelete._id, configToDelete._rev, {
        status: 204,
      })

      const response = await config.api.oauth2.fetch()
      expect(response.configs).toHaveLength(existingConfigs.length - 1)
      expect(
        response.configs.find(c => c._id === configToDelete._id)
      ).toBeUndefined()
    })

    it("throw if config not found", async () => {
      await config.api.oauth2.delete("unexisting", "rev", {
        status: 404,
        body: { message: "OAuth2 config with id 'unexisting' not found." },
      })
    })
  })

  describe("validate", () => {
    function nockTokenCredentials(
      request: {
        oauth2Url: string
        clientId: string
        password: string
        scope: string | undefined
      },
      result: {
        code: number
        body: any
      }
    ) {
      const url = new URL(request.oauth2Url)
      const token = generator.guid()

      // Token request nock
      nock(url.origin)
        .post(url.pathname, body => {
          return (
            body.grant_type === "client_credentials" &&
            (request.scope === undefined || body.scope === request.scope)
          )
        })
        .basicAuth({ user: request.clientId, pass: request.password })
        .reply(200, {
          token_type: "Bearer",
          access_token: token,
        })

      // Protected resource call
      return nock("https://example.com", {
        reqheaders: {
          Authorization: `Bearer ${token}`,
        },
      })
        .get("/")
        .reply(result.code, result.body)
    }

    it("can validate configuration without scope", async () => {
      const oauth2Config = makeOAuth2Config({ scope: undefined })

      nockTokenCredentials(
        {
          oauth2Url: oauth2Config.url,
          clientId: oauth2Config.clientId,
          password: oauth2Config.clientSecret,
          scope: undefined,
        },
        {
          code: 200,
          body: {
            foo: "bar",
          },
        }
      )

      const { name, ...validationConfig } = oauth2Config

      const response = await config.api.oauth2.validate(validationConfig, {
        status: 200,
      })
      expect(response.valid).toBe(true)
    })

    it("can validate configuration with scope", async () => {
      const scope = "read:users write:users"
      const oauth2Config = makeOAuth2Config({ scope })

      nockTokenCredentials(
        {
          oauth2Url: oauth2Config.url,
          clientId: oauth2Config.clientId,
          password: oauth2Config.clientSecret,
          scope,
        },
        {
          code: 200,
          body: {
            foo: "bar",
          },
        }
      )

      const { name, ...validationConfig } = oauth2Config

      const response = await config.api.oauth2.validate(validationConfig, {
        status: 200,
      })
      expect(response.valid).toBe(true)
    })
  })
})
