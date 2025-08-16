import { Project, QuoteKind } from 'ts-morph';
import { wrapEntityClass } from './entity-wrapper';

describe('EntityWrapper - Conflict Detection', () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({
      manipulationSettings: {
        quoteKind: QuoteKind.Single,
      },
    });
  });

  describe('Unique Constraint Conflicts', () => {
    it('should skip @Unique decorator when column already has unique: true', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [{ value: ['path'] }], // This should be skipped
        indexes: [],
        usedImports,
        columnsWithUnique: ['path'], // Column has unique: true
        columnsWithIndex: [],
        validEntityFields: ['path'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      
      // Should NOT have @Unique(['path']) because column already has unique: true
      expect(uniqueDecorators).toHaveLength(0);
      expect(usedImports.has('Unique')).toBe(false);
    });

    it('should keep @Unique decorator when column does not have unique: true', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [{ value: ['name'] }], // This should be kept
        indexes: [],
        usedImports,
        columnsWithUnique: ['path'], // Different column has unique
        columnsWithIndex: [],
        validEntityFields: ['name', 'path'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      
      // Should have @Unique(['name'])
      expect(uniqueDecorators).toHaveLength(1);
      const uniqueArgs = uniqueDecorators[0].getArguments()[0].getText();
      expect(uniqueArgs).toBe("['name']");
      expect(usedImports.has('Unique')).toBe(true);
    });

    it('should handle composite unique constraints correctly', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [{ value: ['parent', 'slug'] }, { value: ['path'] }], // Composite + single
        indexes: [],
        usedImports,
        columnsWithUnique: ['path'], // Only path has column-level unique
        columnsWithIndex: [],
        validEntityFields: ['parent', 'slug', 'path'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      
      // Should only have @Unique(['parent', 'slug']), skip ['path']
      expect(uniqueDecorators).toHaveLength(1);
      const uniqueArgs = uniqueDecorators[0].getArguments()[0].getText();
      expect(uniqueArgs).toBe("['parent', 'slug']");
    });
  });

  describe('Index Constraint Conflicts', () => {
    it('should skip @Index decorator when column already has index: true', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [],
        indexes: [{ value: ['userId'] }], // This should be skipped
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: ['userId'], // Column has index: true
        validEntityFields: ['userId'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should NOT have @Index(['userId']) because column already has index: true
      expect(indexDecorators).toHaveLength(0);
      expect(usedImports.has('Index')).toBe(false);
    });

    it('should skip @Index decorator when column has unique: true (unique implies index)', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [],
        indexes: [{ value: ['email'] }], // This should be skipped
        usedImports,
        columnsWithUnique: ['email'], // Column has unique: true
        columnsWithIndex: [],
        validEntityFields: ['email'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should NOT have @Index(['email']) because unique implies index
      expect(indexDecorators).toHaveLength(0);
      expect(usedImports.has('Index')).toBe(false);
    });

    it('should keep @Index decorator when column has no index/unique', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [],
        indexes: [{ value: ['createdAt'] }], // This should be kept
        usedImports,
        columnsWithUnique: ['email'],
        columnsWithIndex: ['userId'], // Different columns
        validEntityFields: ['createdAt', 'email', 'userId'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should have @Index(['createdAt'])
      expect(indexDecorators).toHaveLength(1);
      const indexArgs = indexDecorators[0].getArguments()[0].getText();
      expect(indexArgs).toBe("['createdAt']");
      expect(usedImports.has('Index')).toBe(true);
    });

    it('should handle composite index constraints correctly', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [],
        indexes: [{ value: ['user', 'category'] }, { value: ['userId'] }], // Composite + single
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: ['userId'], // Only userId has column-level index
        validEntityFields: ['user', 'category', 'userId'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should only have @Index(['user', 'category']), skip ['userId']
      expect(indexDecorators).toHaveLength(1);
      const indexArgs = indexDecorators[0].getArguments()[0].getText();
      expect(indexArgs).toBe("['category', 'user']"); // Sorted alphabetically
    });
  });

  describe('Complex Conflict Scenarios', () => {
    it('should handle multiple conflicts simultaneously', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: ['parent', 'slug'] }, 
          { value: ['path'] }, 
          { value: ['email'] }
        ], // Composite + 2 singles
        indexes: [
          { value: ['user', 'category'] }, 
          { value: ['userId'] }, 
          { value: ['path'] }, 
          { value: ['email'] }
        ], // Composite + 3 singles
        usedImports,
        columnsWithUnique: ['path', 'email'], // These have unique: true
        columnsWithIndex: ['userId'], // This has index: true
        validEntityFields: ['parent', 'slug', 'path', 'email', 'user', 'category', 'userId'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should only have @Unique(['parent', 'slug']) - others conflict
      expect(uniqueDecorators).toHaveLength(1);
      expect(uniqueDecorators[0].getArguments()[0].getText()).toBe("['parent', 'slug']");
      
      // Should only have @Index(['user', 'category']) - others conflict
      expect(indexDecorators).toHaveLength(1);
      expect(indexDecorators[0].getArguments()[0].getText()).toBe("['category', 'user']"); // Sorted alphabetically
    });

    it('should handle empty arrays gracefully', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [],
        indexes: [],
        usedImports,
        columnsWithUnique: ['path'],
        columnsWithIndex: ['userId'],
        validEntityFields: [], // No valid fields defined
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should have no decorators except @Entity
      expect(uniqueDecorators).toHaveLength(0);
      expect(indexDecorators).toHaveLength(0);
      expect(usedImports.has('Unique')).toBe(false);
      expect(usedImports.has('Index')).toBe(false);
    });

    it('should not conflict different column combinations', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [{ value: ['parent', 'slug'] }],
        indexes: [{ value: ['user', 'category'] }],
        usedImports,
        columnsWithUnique: ['path'], // Different from composites
        columnsWithIndex: ['userId'], // Different from composites
        validEntityFields: ['parent', 'slug', 'user', 'category', 'path', 'userId'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should have both composite constraints since they don't conflict
      expect(uniqueDecorators).toHaveLength(1);
      expect(indexDecorators).toHaveLength(1);
      expect(uniqueDecorators[0].getArguments()[0].getText()).toBe("['parent', 'slug']");
      expect(indexDecorators[0].getArguments()[0].getText()).toBe("['category', 'user']"); // Sorted alphabetically
    });
  });

  describe('Order-based Duplicate Detection', () => {
    it('should detect @Unique duplicates with different field orders', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: ['parent', 'slug'] },
          { value: ['slug', 'parent'] }, // Same constraint, different order - should be deduplicated
          { value: ['name', 'category'] }
        ],
        indexes: [],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
        validEntityFields: ['parent', 'slug', 'name', 'category'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      
      // Should only have 2 unique decorators, not 3 (duplicate ['parent','slug'] vs ['slug','parent'])
      expect(uniqueDecorators).toHaveLength(2);
      
      const uniqueArgs = uniqueDecorators.map(d => d.getArguments()[0].getText()).sort();
      expect(uniqueArgs).toEqual([
        "['category', 'name']", // Sorted alphabetically
        "['parent', 'slug']"    // Sorted alphabetically
      ]);
    });

    it('should detect @Index duplicates with different field orders', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [],
        indexes: [
          { value: ['user', 'category'] },
          { value: ['category', 'user'] }, // Same constraint, different order - should be deduplicated
          { value: ['created', 'updated'] }
        ],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
        validEntityFields: ['user', 'category', 'created', 'updated'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should only have 2 index decorators, not 3
      expect(indexDecorators).toHaveLength(2);
      
      const indexArgs = indexDecorators.map(d => d.getArguments()[0].getText()).sort();
      expect(indexArgs).toEqual([
        "['category', 'user']",     // Sorted alphabetically
        "['created', 'updated']"    // Sorted alphabetically
      ]);
    });

    it('should handle mixed order duplicates across unique and index', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: ['parent', 'slug'] }
        ],
        indexes: [
          { value: ['slug', 'parent'] }, // Same fields as unique but in different order - should be skipped
          { value: ['user', 'role'] }
        ],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
        validEntityFields: ['parent', 'slug', 'user', 'role'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should have 1 unique and 1 index (the duplicate ['slug','parent'] should be skipped)
      expect(uniqueDecorators).toHaveLength(1);
      expect(indexDecorators).toHaveLength(1);
      
      expect(uniqueDecorators[0].getArguments()[0].getText()).toBe("['parent', 'slug']");
      expect(indexDecorators[0].getArguments()[0].getText()).toBe("['role', 'user']"); // Sorted
    });

    it('should handle triple+ field combinations with different orders', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: ['a', 'b', 'c'] },
          { value: ['c', 'a', 'b'] }, // Same fields, different order
          { value: ['b', 'c', 'a'] }  // Same fields, different order again
        ],
        indexes: [],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
        validEntityFields: ['a', 'b', 'c'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      
      // Should only have 1 unique decorator
      expect(uniqueDecorators).toHaveLength(1);
      expect(uniqueDecorators[0].getArguments()[0].getText()).toBe("['a', 'b', 'c']"); // Sorted
    });
  });

  describe('Malicious/Evil Test Cases - Breaking the System', () => {
    it('should handle empty arrays in constraints', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      expect(() => {
        wrapEntityClass({
          sourceFile,
          className: 'TestEntity',
          tableName: 'test_entity',
          uniques: [
            { value: [] }, // Empty array - should not crash
            { value: ['name'] }
          ],
          indexes: [
            { value: [] }, // Empty array - should not crash
            { value: ['email'] }
          ],
          usedImports,
          columnsWithUnique: [],
          columnsWithIndex: [],
          validEntityFields: ['name', 'email'], // Add valid fields
        });
      }).not.toThrow();

      const decorators = sourceFile.getClasses()[0].getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should only have valid constraints, empty arrays should be ignored
      expect(uniqueDecorators).toHaveLength(1);
      expect(indexDecorators).toHaveLength(1);
    });

    it('should handle special characters and SQL injection attempts in column names', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const evilColumns = [
        "'; DROP TABLE users; --",
        "user`name",
        "email\"address",
        "data\\field",
        "field name with spaces",
        "UPPERCASE_FIELD",
        "lowercase_field",
        "field-with-dashes",
        "field.with.dots"
      ];

      expect(() => {
        wrapEntityClass({
          sourceFile,
          className: 'TestEntity',
          tableName: 'test_entity',
          uniques: [
            { value: [evilColumns[0], evilColumns[1]] },
            { value: [evilColumns[2]] }
          ],
          indexes: [
            { value: [evilColumns[3]] }, // Single column that conflicts
            { value: [evilColumns[4]] }  // Different single column
          ],
          usedImports,
          columnsWithUnique: [evilColumns[2]], // Column has unique: true
          columnsWithIndex: [evilColumns[3]], // Column has index: true
          validEntityFields: evilColumns, // All evil columns are "valid" for this test
        });
      }).not.toThrow();

      const decorators = sourceFile.getClasses()[0].getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should handle evil characters without crashing
      expect(uniqueDecorators).toHaveLength(1); // One should be skipped due to column conflict
      expect(indexDecorators).toHaveLength(1); // One should be skipped due to column conflict, one should remain
    });

    it('should handle case sensitivity conflicts', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: ['Name', 'Category'] },
          { value: ['name', 'category'] }, // Different case - should be treated as different
          { value: ['NAME', 'CATEGORY'] }  // Different case - should be treated as different
        ],
        indexes: [],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
        validEntityFields: ['Name', 'Category', 'name', 'category', 'NAME', 'CATEGORY'], // Add all case variations
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      
      // All should be treated as different constraints (case sensitive)
      expect(uniqueDecorators).toHaveLength(3);
    });

    it('should handle very long column names without memory issues', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const veryLongColumnName = 'a'.repeat(1000) + '_column';
      const anotherLongName = 'b'.repeat(1000) + '_field';

      expect(() => {
        wrapEntityClass({
          sourceFile,
          className: 'TestEntity',
          tableName: 'test_entity',
          uniques: [
            { value: [veryLongColumnName, anotherLongName] }
          ],
          indexes: [
            { value: [veryLongColumnName] }
          ],
          usedImports,
          columnsWithUnique: [],
          columnsWithIndex: [],
        });
      }).not.toThrow();
    });

    it('should handle unicode and emoji in column names', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const unicodeColumns = [
        "用户名", // Chinese
        "имя_пользователя", // Russian
        "ユーザー名", // Japanese
        "😀_emoji_field",
        "🚀rocket_field",
        "field_with_♠️_symbol"
      ];

      expect(() => {
        wrapEntityClass({
          sourceFile,
          className: 'TestEntity',
          tableName: 'test_entity',
          uniques: [
            { value: [unicodeColumns[0], unicodeColumns[1]] }
          ],
          indexes: [
            { value: [unicodeColumns[2], unicodeColumns[3]] }
          ],
          usedImports,
          columnsWithUnique: [],
          columnsWithIndex: [],
        });
      }).not.toThrow();
    });

    it('should handle duplicate detection with mixed data types', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: ['field1', 'field2'] },
          { value: ['field2', 'field1'] }, // Same fields, different order
        ],
        indexes: [
          { value: ['field1', 'field2'] }, // Same as unique - should be skipped
          { value: ['field3'] }
        ],
        usedImports,
        columnsWithUnique: ['field3'], // This should conflict with index
        columnsWithIndex: [],
        validEntityFields: ['field1', 'field2', 'field3'], // Add valid fields
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should have 1 unique (duplicate removed) and 0 indexes (conflicts resolved)
      expect(uniqueDecorators).toHaveLength(1);
      expect(indexDecorators).toHaveLength(0);
    });

    it('should handle massive arrays without performance issues', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      // Create 100 duplicate constraints with different orders
      const massiveUniques = [];
      const massiveIndexes = [];
      
      for (let i = 0; i < 50; i++) {
        massiveUniques.push({ value: ['field1', 'field2', 'field3'] });
        massiveUniques.push({ value: ['field3', 'field1', 'field2'] });
        massiveIndexes.push({ value: ['field4', 'field5'] });
        massiveIndexes.push({ value: ['field5', 'field4'] });
      }

      const startTime = Date.now();
      
      expect(() => {
        wrapEntityClass({
          sourceFile,
          className: 'TestEntity',
          tableName: 'test_entity',
          uniques: massiveUniques,
          indexes: massiveIndexes,
          usedImports,
          columnsWithUnique: [],
          columnsWithIndex: [],
          validEntityFields: ['field1', 'field2', 'field3', 'field4', 'field5'], // Add valid fields for massive test
        });
      }).not.toThrow();

      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Should process in reasonable time (< 1 second)
      expect(processingTime).toBeLessThan(1000);
      
      const decorators = sourceFile.getClasses()[0].getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Should deduplicate to only 2 constraints (1 unique, 1 index)
      expect(uniqueDecorators).toHaveLength(1);
      expect(indexDecorators).toHaveLength(1);
    });

    it('should handle null/undefined column names gracefully', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      expect(() => {
        wrapEntityClass({
          sourceFile,
          className: 'TestEntity',
          tableName: 'test_entity',
          uniques: [
            { value: ['validField', null as any] },
            { value: [undefined as any, 'anotherField'] }
          ],
          indexes: [
            { value: ['field', ''] } // Empty string
          ],
          usedImports,
          columnsWithUnique: [null as any, undefined as any],
          columnsWithIndex: [''],
        });
      }).not.toThrow();
    });
  });

  describe('Field Existence Validation - Breaking the System', () => {
    it('should handle references to non-existent fields', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: ['nonExistentField'] }, // Field doesn't exist in entity
          { value: ['anotherMissingField'] } // Another non-existent field
        ],
        indexes: [
          { value: ['missingIndexField'] } // Field doesn't exist
        ],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
        // No way to pass actual entity field list - this exposes the vulnerability!
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // FIXED: System now skips decorators for non-existent fields
      expect(uniqueDecorators).toHaveLength(0); // No valid fields, all skipped
      expect(indexDecorators).toHaveLength(0);  // No valid fields, all skipped
    });

    it('should handle mixed valid and invalid field references', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: ['validField', 'nonExistentField'] }, // Mixed valid/invalid
          { value: ['name', 'email'] } // Both should be valid
        ],
        indexes: [
          { value: ['validField'] }, // Valid
          { value: ['invalidField'] } // Invalid
        ],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
        validEntityFields: ['validField', 'name', 'email']
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // FIXED: System now validates fields and skips invalid ones
      expect(uniqueDecorators).toHaveLength(1); // Only ['name', 'email'] should remain
      expect(indexDecorators).toHaveLength(1);  // Only ['validField'] should remain
    });

    it('should handle typos in field names', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: ['usrename'] }, // Typo: should be 'username'
          { value: ['emai'] },     // Typo: should be 'email'
          { value: ['username'] }  // Correct
        ],
        indexes: [
          { value: ['cretedAt'] }, // Typo: should be 'createdAt'
          { value: ['updatedAt'] } // Correct
        ],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
        validEntityFields: ['username', 'email', 'createdAt', 'updatedAt']
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // FIXED: System now validates field names and skips typos
      expect(uniqueDecorators).toHaveLength(1); // Only ['username'] should remain
      expect(indexDecorators).toHaveLength(1);  // Only ['updatedAt'] should remain
    });

    it('should handle case sensitivity in field validation', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: ['USERNAME'] }, // Wrong case
          { value: ['Username'] }, // Wrong case
          { value: ['username'] }  // Correct case
        ],
        indexes: [
          { value: ['EMAIL'] },    // Wrong case
          { value: ['email'] }     // Correct case
        ],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
        validEntityFields: ['username', 'email']
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // FIXED: System now validates case-sensitive field names
      expect(uniqueDecorators).toHaveLength(1); // Only ['username'] should remain
      expect(indexDecorators).toHaveLength(1);  // Only ['email'] should remain
    });

    it('should handle empty field names in constraints', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: [''] },           // Empty string
          { value: ['  '] },         // Whitespace only
          { value: ['validField'] }  // Valid
        ],
        indexes: [
          { value: ['', 'validField'] }, // Mixed empty and valid - will become ['validField']
          { value: ['anotherField'] }    // Different valid field to avoid duplicate
        ],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
        validEntityFields: ['validField', 'anotherField']
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // Empty fields are filtered by current logic
      expect(uniqueDecorators).toHaveLength(1); // Only ['validField'] - empty strings filtered
      expect(indexDecorators).toHaveLength(1);  // Only ['anotherField'] - ['validField'] conflicts with unique
    });

    it('should validate against system fields (createdAt, updatedAt)', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [
          { value: ['createdAt'] },  // System field - should be valid
          { value: ['updatedAt'] },  // System field - should be valid
          { value: ['createdBy'] },  // Not a system field in basic entity
        ],
        indexes: [
          { value: ['createdAt', 'updatedAt'] } // Both system fields
        ],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
        validEntityFields: ['id']
      });

      const decorators = classDeclaration.getDecorators();
      const uniqueDecorators = decorators.filter(d => d.getName() === 'Unique');
      const indexDecorators = decorators.filter(d => d.getName() === 'Index');
      
      // FIXED: System validates against known system fields
      expect(uniqueDecorators).toHaveLength(2); // createdAt, updatedAt valid (system fields)
      expect(indexDecorators).toHaveLength(1);  // createdAt+updatedAt valid (system fields)
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined/null parameters', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      expect(() => {
        wrapEntityClass({
          sourceFile,
          className: 'TestEntity',
          tableName: 'test_entity',
          uniques: undefined,
          indexes: undefined,
          usedImports,
          columnsWithUnique: undefined,
          columnsWithIndex: undefined,
        });
      }).not.toThrow();
    });

    it('should preserve decorator order consistently', () => {
      const sourceFile = project.createSourceFile('test.ts', '', { overwrite: true });
      const usedImports = new Set<string>();

      const classDeclaration = wrapEntityClass({
        sourceFile,
        className: 'TestEntity',
        tableName: 'test_entity',
        uniques: [{ value: ['a', 'b'] }, { value: ['c', 'd'] }],
        indexes: [{ value: ['e', 'f'] }, { value: ['g', 'h'] }],
        usedImports,
        columnsWithUnique: [],
        columnsWithIndex: [],
      });

      const decorators = classDeclaration.getDecorators();
      
      // @Entity should always be first
      expect(decorators[0].getName()).toBe('Entity');
      
      // @Unique should come before @Index
      const decoratorNames = decorators.map(d => d.getName());
      const uniqueIndex = decoratorNames.indexOf('Unique');
      const indexIndex = decoratorNames.indexOf('Index');
      
      if (uniqueIndex !== -1 && indexIndex !== -1) {
        expect(uniqueIndex).toBeLessThan(indexIndex);
      }
    });
  });
});