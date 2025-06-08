import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Route_definition } from "./route_definition.entity";

@Entity('hook_definition')
export class Hook_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    afterHook: string;
    @Column({ type: "text", nullable: true })
    preHook: string;
    @Column({ type: "int", nullable: true, default: 0 })
    priority: number;
    @ManyToMany(() => Route_definition, (rel) => rel.hooks, { nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinTable()
    routes: Route_definition[];
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
