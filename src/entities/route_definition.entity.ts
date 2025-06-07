import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToMany, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Role_definition } from "./role_definition.entity";
import { Table_definition } from "./table_definition.entity";
import { Middleware_definition } from "./middleware_definition.entity";

@Entity('route_definition')
@Unique(["path", "method"])
export class Route_definition {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: "text", nullable: false })
  handler: string;

  @Column({ type: "boolean", nullable: true, default: false })
  isEnabled: boolean;

  @Column({ type: "boolean", nullable: false, default: false })
  isPublished: boolean;

  @Column({ type: "varchar", nullable: false, default: "GET" })
  method: string;

  @Column({ type: "varchar", nullable: false })
  path: string;

  @ManyToMany(() => Role_definition, rel => rel.routes, { nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  roles: Role_definition[];

  @ManyToMany(() => Table_definition, { eager: true, nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  targetTables: Table_definition[];

  @ManyToMany(() => Middleware_definition, rel => rel.routes, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  middlewares: Middleware_definition[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
