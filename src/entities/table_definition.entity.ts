import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { Column_definition } from "./column_definition.entity";
import { Relation_definition } from "./relation_definition.entity";

@Entity("table_definition")
export class Table_definition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: "varchar", nullable: false, unique: true })
  name: string;

  @Column({ type: "boolean", nullable: false, default: false })
  isStatic: boolean;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;

  @OneToMany(() => Column_definition, rel => rel.table,{ eager: true, cascade: true })
  columns: Column_definition[];

  @OneToMany(() => Relation_definition, rel => rel.sourceTable,{ eager: true, cascade: true })
  relations: Relation_definition[];
}