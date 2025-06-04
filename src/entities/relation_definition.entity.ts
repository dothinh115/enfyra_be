import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Table_definition } from "./table_definition.entity";

@Entity("relation_definition")
export class Relation_definition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: "enum", nullable: false, enum: ['one-to-one', 'many-to-one', 'one-to-many', 'many-to-many'] })
  type: 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many';

  @Column({ type: "varchar", nullable: false })
  propertyName: string;

  @Column({ type: "varchar", nullable: true })
  inversePropertyName: string;

  @Column({ type: "boolean", nullable: false, default: false })
  isEager: boolean;

  @Column({ type: "boolean", nullable: false, default: true })
  isNullable: boolean;

  @Column({ type: "boolean", nullable: false, default: false })
  isStatic: boolean;

  @Column({ type: "boolean", nullable: false, default: false })
  isInverseEager: boolean;


  @ManyToOne(() => Table_definition, { nullable: true } )
  @JoinColumn()
  targetTable: Table_definition;

  @ManyToOne(() => Table_definition, rel => rel.relations , { nullable: true } )
  @JoinColumn()
  sourceTable: Table_definition;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}