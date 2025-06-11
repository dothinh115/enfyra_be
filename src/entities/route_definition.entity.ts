import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, ManyToMany, JoinTable, OneToMany, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Table_definition } from "./table_definition.entity";
import { Permission_definition } from "./permission_definition.entity";
import { Route_handler_definition } from "./route_handler_definition.entity";
import { Middleware_definition } from "./middleware_definition.entity";
import { Hook_definition } from "./hook_definition.entity";

@Entity('route_definition')
@Unique(['path', 'mainTable'])
export class Route_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "boolean", nullable: true, default: false })
    isEnabled: boolean;
    @Column({ type: "varchar", nullable: false })
    path: string;
    @Column({ type: "simple-json", nullable: true })
    publishedMethods: any;
    @ManyToOne(() => Table_definition, { nullable: false, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    mainTable: Table_definition;
    @ManyToMany(() => Table_definition, { eager: true, nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinTable()
    targetTables: Table_definition[];
    @OneToMany(() => Permission_definition, (rel) => rel.route, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    permissions: Permission_definition[];
    @OneToMany(() => Route_handler_definition, (rel) => rel.route, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    handlers: Route_handler_definition[];
    @OneToMany(() => Middleware_definition, (rel) => rel.route, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    middlewares: Middleware_definition[];
    @OneToMany(() => Hook_definition, (rel) => rel.route, { cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    hooks: Hook_definition[];
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
