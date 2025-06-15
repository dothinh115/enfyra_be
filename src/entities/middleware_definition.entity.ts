import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Route_definition } from "./route_definition.entity";

@Entity('middleware_definition')
export class Middleware_definition {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "text", nullable: true })
    description: string;
    @Column({ type: "text", nullable: false })
    handler: string;
    @Column({ type: "boolean", nullable: false, default: false })
    isEnabled: boolean;
    @Column({ type: "varchar", nullable: false, unique: true })
    name: string;
    @Column({ type: "int", nullable: true, default: 0 })
    priority: number;
    @Index()
    @ManyToOne(() => Route_definition, (rel) => rel.middlewares, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    route: Route_definition;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
