import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Table_definition } from "./table_definition.entity";

@Entity("relation_definition")
export class Relation_definition {
  @Column({ type: "boolean", nullable: false, default: false })
  isInverseEager: boolean;

  @Column({ type: "boolean", nullable: false, default: false })
  isStatic: boolean;

  @Column({ type: "boolean", nullable: false, default: true })
  isNullable: boolean;

  @Column({ type: "boolean", nullable: false, default: false })
  isEager: boolean;

  @Column({ type: "varchar", nullable: true })
  inversePropertyName: string;

  @Column({ type: "varchar", nullable: false })
  propertyName: string;

  @Column({ type: "enum", nullable: false, enum: ['one-to-one', 'many-to-one', 'one-to-many', 'many-to-many'] })
  type: 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many';

  @PrimaryGeneratedColumn('increment')
  id: number;


  @ManyToOne(() => Table_definition, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' } )
  @JoinColumn()
  targetTable: Table_definition;

  @ManyToOne(() => Table_definition, rel => rel.relations , { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' } )
  @JoinColumn()
  sourceTable: Table_definition;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}