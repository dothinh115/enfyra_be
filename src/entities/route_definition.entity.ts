import { Entity, Column, PrimaryGeneratedColumn, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Table_definition } from "./table_definition.entity";

@Entity("route_definition")
export class Route_definition {
  @Column({ type: "boolean", nullable: true, default: false })
  isEnabled: boolean;

  @Column({ type: "boolean", nullable: false, default: true })
  isPublished: boolean;

  @Column({ type: "text", nullable: false })
  handler: string;

  @Column({ type: "varchar", nullable: false })
  path: string;

  @Column({ type: "varchar", nullable: false, default: "GET" })
  method: string;

  @PrimaryGeneratedColumn('increment')
  id: number;


  @ManyToMany(() => Table_definition, { eager: true, nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' } )
  @JoinTable()
  targetTables: Table_definition[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}