import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Route_definition } from "./route_definition.entity";

@Entity('middleware_definition')
export class Middleware_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: false })
    handler: string;
    @Column({ type: "boolean", nullable: false, default: false })
    isEnabled: boolean;
    @Column({ type: "varchar", nullable: false, unique: true })
    name: string;
    @Column({ type: "int", nullable: true, default: 0 })
    priority: number;
    @ManyToMany(() => Route_definition, (rel) => rel.middlewares, { nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinTable()
    routes: Route_definition[];
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
