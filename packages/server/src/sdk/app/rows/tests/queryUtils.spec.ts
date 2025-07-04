import {
  FieldType,
  RelationshipType,
  SearchFilters,
  Table,
} from "@budibase/types"
import { getQueryableFields, validateFilters } from "../queryUtils"
import { structures } from "../../../../api/routes/tests/utilities"
import TestConfiguration from "../../../../tests/utilities/TestConfiguration"

describe("query utils", () => {
  describe("validateFilters", () => {
    const fullFilters: SearchFilters = {
      equal: { one: "foo" },
      $or: {
        conditions: [
          {
            equal: { one: "foo2", two: "bar" },
            notEmpty: { one: null },
            $and: {
              conditions: [
                {
                  equal: { three: "baz" },
                  notEmpty: { forth: null },
                },
              ],
            },
          },
        ],
      },
      $and: {
        conditions: [{ equal: { one: "foo2" }, notEmpty: { one: null } }],
      },
    }

    it("does not throw on empty filters", () => {
      expect(() => validateFilters({}, [])).not.toThrow()
    })

    it("does not throw on valid fields", () => {
      expect(() =>
        validateFilters(fullFilters, ["one", "two", "three", "forth"])
      ).not.toThrow()
    })

    it("throws on invalid fields", () => {
      expect(() =>
        validateFilters(fullFilters, ["one", "three", "forth"])
      ).toThrow()
    })

    it("can handle numbered fields", () => {
      const prefixedFilters: SearchFilters = {
        equal: { "1:one": "foo" },
        $or: {
          conditions: [
            {
              equal: { "2:one": "foo2", "3:two": "bar" },
              notEmpty: { "4:one": null },
              $and: {
                conditions: [
                  {
                    equal: { "5:three": "baz", two: "bar2" },
                    notEmpty: { forth: null },
                  },
                ],
              },
            },
          ],
        },
        $and: {
          conditions: [{ equal: { "6:one": "foo2" }, notEmpty: { one: null } }],
        },
      }

      expect(() =>
        validateFilters(prefixedFilters, ["one", "two", "three", "forth"])
      ).not.toThrow()
    })

    it("can handle relationships", () => {
      const prefixedFilters: SearchFilters = {
        $or: {
          conditions: [
            { equal: { "1:other.one": "foo" } },
            {
              equal: {
                "2:other.one": "foo2",
                "3:other.two": "bar",
                "4:other.three": "baz",
              },
            },
            { equal: { "another.three": "baz2" } },
          ],
        },
      }

      expect(() =>
        validateFilters(prefixedFilters, [
          "other.one",
          "other.two",
          "other.three",
          "another.three",
        ])
      ).not.toThrow()
    })

    it("throws on invalid relationship fields", () => {
      const prefixedFilters: SearchFilters = {
        $or: {
          conditions: [
            { equal: { "1:other.one": "foo" } },
            {
              equal: {
                "2:other.one": "foo2",
                "3:other.two": "bar",
                "4:other.three": "baz",
              },
            },
            { equal: { "another.four": "baz2" } },
          ],
        },
      }

      expect(() =>
        validateFilters(prefixedFilters, [
          "other.one",
          "other.two",
          "other.three",
        ])
      ).toThrow()
    })
  })

  describe("getQueryableFields", () => {
    const config = new TestConfiguration()

    beforeAll(async () => {
      await config.init()
    })

    it("returns table schema fields and _id", async () => {
      const table: Table = await config.api.table.save({
        ...structures.basicTable(),
        schema: {
          name: { name: "name", type: FieldType.STRING },
          age: { name: "age", type: FieldType.NUMBER },
        },
      })

      const result = await getQueryableFields(table)
      expect(result).toEqual(["_id", "name", "age"])
    })

    it("excludes hidden fields", async () => {
      const table: Table = await config.api.table.save({
        ...structures.basicTable(),
        schema: {
          name: { name: "name", type: FieldType.STRING },
          age: { name: "age", type: FieldType.NUMBER, visible: false },
        },
      })

      const result = await getQueryableFields(table)
      expect(result).toEqual(["_id", "name"])
    })

    it("includes relationship fields", async () => {
      const aux: Table = await config.api.table.save({
        ...structures.basicTable(),
        name: "auxTable",
        schema: {
          title: { name: "title", type: FieldType.STRING },
          name: { name: "name", type: FieldType.STRING },
        },
      })

      const table: Table = await config.api.table.save({
        ...structures.basicTable(),
        schema: {
          name: { name: "name", type: FieldType.STRING },
          aux: {
            name: "aux",
            type: FieldType.LINK,
            tableId: aux._id!,
            relationshipType: RelationshipType.ONE_TO_MANY,
            fieldName: "table",
          },
        },
      })

      const result = await config.doInContext(config.appId, () => {
        return getQueryableFields(table)
      })
      expect(result).toEqual([
        "_id",
        "name",
        "aux._id",
        "auxTable._id",
        "aux.title",
        "auxTable.title",
        "aux.name",
        "auxTable.name",
      ])
    })

    it("excludes hidden relationship fields", async () => {
      const aux: Table = await config.api.table.save({
        ...structures.basicTable(),
        name: "auxTable",
        schema: {
          title: { name: "title", type: FieldType.STRING, visible: false },
          name: { name: "name", type: FieldType.STRING, visible: true },
        },
      })

      const table: Table = await config.api.table.save({
        ...structures.basicTable(),
        schema: {
          name: { name: "name", type: FieldType.STRING },
          aux: {
            name: "aux",
            type: FieldType.LINK,
            tableId: aux._id!,
            relationshipType: RelationshipType.ONE_TO_MANY,
            fieldName: "table",
          },
        },
      })

      const result = await config.doInContext(config.appId, () => {
        return getQueryableFields(table)
      })
      expect(result).toEqual([
        "_id",
        "name",
        "aux._id",
        "auxTable._id",
        "aux.name",
        "auxTable.name",
      ])
    })

    it("excludes all relationship fields if hidden", async () => {
      const aux: Table = await config.api.table.save({
        ...structures.basicTable(),
        name: "auxTable",
        schema: {
          title: { name: "title", type: FieldType.STRING, visible: false },
          name: { name: "name", type: FieldType.STRING, visible: true },
        },
      })

      const table: Table = await config.api.table.save({
        ...structures.basicTable(),
        schema: {
          name: { name: "name", type: FieldType.STRING },
          aux: {
            name: "aux",
            type: FieldType.LINK,
            tableId: aux._id!,
            relationshipType: RelationshipType.ONE_TO_MANY,
            fieldName: "table",
            visible: false,
          },
        },
      })

      const result = await config.doInContext(config.appId, () => {
        return getQueryableFields(table)
      })
      expect(result).toEqual(["_id", "name"])
    })

    describe("nested relationship", () => {
      describe("one-to-many", () => {
        let table: Table, aux1: Table, aux2: Table

        beforeAll(async () => {
          const { _id: aux1Id } = await config.api.table.save({
            ...structures.basicTable(),
            name: "aux1Table",
            schema: {
              name: { name: "name", type: FieldType.STRING },
            },
          })
          const { _id: aux2Id } = await config.api.table.save({
            ...structures.basicTable(),
            name: "aux2Table",
            schema: {
              title: { name: "title", type: FieldType.STRING },
              aux1_1: {
                name: "aux1_1",
                type: FieldType.LINK,
                tableId: aux1Id!,
                relationshipType: RelationshipType.ONE_TO_MANY,
                fieldName: "aux2_1",
              },
              aux1_2: {
                name: "aux1_2",
                type: FieldType.LINK,
                tableId: aux1Id!,
                relationshipType: RelationshipType.ONE_TO_MANY,
                fieldName: "aux2_2",
              },
            },
          })

          const { _id: tableId } = await config.api.table.save({
            ...structures.basicTable(),
            schema: {
              name: { name: "name", type: FieldType.STRING },
              aux1: {
                name: "aux1",
                type: FieldType.LINK,
                tableId: aux1Id!,
                relationshipType: RelationshipType.ONE_TO_MANY,
                fieldName: "table",
              },
              aux2: {
                name: "aux2",
                type: FieldType.LINK,
                tableId: aux2Id!,
                relationshipType: RelationshipType.ONE_TO_MANY,
                fieldName: "table",
              },
            },
          })

          // We need to refech them to get the updated foreign keys
          aux1 = await config.api.table.get(aux1Id!)
          aux2 = await config.api.table.get(aux2Id!)
          table = await config.api.table.get(tableId!)
        })

        it("includes nested relationship fields from main table", async () => {
          const result = await config.doInContext(config.appId, () => {
            return getQueryableFields(table)
          })
          expect(result).toEqual([
            "_id",
            "name",
            // aux1 primitive props
            "aux1._id",
            "aux1Table._id",
            "aux1.name",
            "aux1Table.name",

            // aux2 primitive props
            "aux2._id",
            "aux2Table._id",
            "aux2.title",
            "aux2Table.title",
          ])
        })

        it("includes nested relationship fields from aux 1 table", async () => {
          const result = await config.doInContext(config.appId, () => {
            return getQueryableFields(aux1)
          })
          expect(result).toEqual([
            "_id",
            "name",

            // aux2_1 primitive props
            "aux2_1._id",
            "aux2Table._id",
            "aux2_1.title",
            "aux2Table.title",

            // aux2_2 primitive props
            "aux2_2._id",
            "aux2_2.title",

            // table primitive props
            "table._id",
            "TestTable._id",
            "table.name",
            "TestTable.name",
          ])
        })

        it("includes nested relationship fields from aux 2 table", async () => {
          const result = await config.doInContext(config.appId, () => {
            return getQueryableFields(aux2)
          })
          expect(result).toEqual([
            "_id",
            "title",

            // aux1_1 primitive props
            "aux1_1._id",
            "aux1Table._id",
            "aux1_1.name",
            "aux1Table.name",

            // aux1_2 primitive props
            "aux1_2._id",
            "aux1_2.name",

            // table primitive props
            "table._id",
            "TestTable._id",
            "table.name",
            "TestTable.name",
          ])
        })
      })

      describe("many-to-many", () => {
        let table: Table, aux: Table

        beforeAll(async () => {
          const { _id: auxId } = await config.api.table.save({
            ...structures.basicTable(),
            name: "auxTable",
            schema: {
              title: { name: "title", type: FieldType.STRING },
            },
          })

          const { _id: tableId } = await config.api.table.save({
            ...structures.basicTable(),
            schema: {
              name: { name: "name", type: FieldType.STRING },
              aux: {
                name: "aux",
                type: FieldType.LINK,
                tableId: auxId!,
                relationshipType: RelationshipType.MANY_TO_MANY,
                fieldName: "table",
              },
            },
          })

          // We need to refech them to get the updated foreign keys
          aux = await config.api.table.get(auxId!)
          table = await config.api.table.get(tableId!)
        })

        it("includes nested relationship fields from main table", async () => {
          const result = await config.doInContext(config.appId, () => {
            return getQueryableFields(table)
          })
          expect(result).toEqual([
            "_id",
            "name",

            // deep 1 aux primitive props
            "aux._id",
            "auxTable._id",
            "aux.title",
            "auxTable.title",
          ])
        })

        it("includes nested relationship fields from aux table", async () => {
          const result = await config.doInContext(config.appId, () => {
            return getQueryableFields(aux)
          })
          expect(result).toEqual([
            "_id",
            "title",

            // deep 1 dependency primitive props
            "table._id",
            "TestTable._id",
            "table.name",
            "TestTable.name",
          ])
        })
      })
    })
  })
})
