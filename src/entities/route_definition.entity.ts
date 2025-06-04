import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Table_definition } from "./table_definition.entity";

@Entity("route_definition")
export class Route_definition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: "varchar", nullable: false, default: "GET" })
  method: string;

  @Column({ type: "varchar", nullable: false })
  path: string;

  @Column({ type: "text", nullable: false })
  handler: string;

  @Column({ type: "boolean", nullable: false, default: true })
  isPublished: boolean;

  @Column({ type: "boolean", nullable: true, default: false })
  isEnabled: boolean;


  @ManyToMany(() => Table_definition, { eager: true, onDelete: 'NO ACTION', onUpdate: 'NO ACTION', nullable: true } )
  @JoinTable()
  targetTables: Table_definition[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}